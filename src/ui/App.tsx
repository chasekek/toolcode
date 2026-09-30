import os from 'node:os';
import path from 'node:path';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useStdout} from 'ink';
import {useKeys} from './hooks/useKeys.js';
import {useSyncState} from './hooks/useSyncState.js';
import {getCommand} from '../core/commands.js';
import type {AssistantMessage, Mode, Settings} from '../core/types.js';
import type {PluginLoadReport} from '../plugins/loader.js';
import {install, installPath, isInstalled, readCatalog, uninstall, type CatalogEntry} from '../plugins/marketplace.js';
import type {LoadedPlugin} from '../plugins/types.js';
import {removeStoredKey, setStoredKey} from '../providers/auth.js';
import {refreshOpenRouterModels} from '../providers/openrouter.js';
import {defaultProvider, findModel, getApiKey, getProvider, keySource, providers} from '../providers/registry.js';
import type {Provider} from '../providers/types.js';
import {VERSION} from '../version.js';
import {changedFiles, toolCalls, type FileChange} from './activity.js';
import {parseCommand} from './commands.js';
import {onConsole} from './console.js';
import {useChat} from './hooks/useChat.js';
import {usePrompt} from './hooks/usePrompt.js';
import {useTerminalSize} from './hooks/useTerminalSize.js';
import {computeLayout, contains, windowStart, type FocusId, type SidePanelId} from './layout.js';
import {MOUSE_OFF, MOUSE_ON, parseMouse, type MouseEvent} from './mouse.js';
import {tildePath} from './text.js';
import {createTheme, ThemeProvider} from './theme.js';
import {AskPanel} from './components/AskPanel.js';
import {AuthPanel} from './components/AuthPanel.js';
import {ChatView} from './components/ChatView.js';
import {CommandMenu, menuHeight} from './components/CommandMenu.js';
import {ConfigPanel} from './components/ConfigPanel.js';
import {DetailView, type Detail} from './components/DetailView.js';
import {FilesPanel} from './components/FilesPanel.js';
import {HelpModal} from './components/HelpModal.js';
import {KeyBar, type Hint} from './components/KeyBar.js';
import {KeysPopup, keysPopupHeight} from './components/KeysPopup.js';
import {MarketplaceScreen} from './components/MarketplaceScreen.js';
import {Overlay} from './components/Modal.js';
import {ModelPicker} from './components/ModelPicker.js';
import {Panel} from './components/Panel.js';
import {PromptPanel} from './components/PromptPanel.js';
import {ScrollBox} from './components/ScrollBox.js';
import {SessionPanel} from './components/SessionPanel.js';
import {ActivityIndicator} from './components/Spinner.js';
import {TodoRow, TodosPanel} from './components/TodosPanel.js';
import {ToolsPanel} from './components/ToolsPanel.js';
import {Welcome} from './components/Welcome.js';

type Popup =
	| null
	| {kind: 'model'; returnTo?: 'config'}
	| {kind: 'config'}
	| {kind: 'marketplace'}
	| {kind: 'auth'; initial?: string; returnTo?: 'config'}
	| {kind: 'help'};

type ListId = 'todos' | 'files' | 'tools';

/** What the app hands back on exit, for the summary printed after the screen is restored. */
export interface ExitSummary {
	turns: number;
	files: FileChange[];
}

const FOCUS_ORDER: FocusId[] = ['prompt', 'chat', 'session', 'todos', 'files', 'tools'];
const PANEL_KEYS: Record<string, FocusId> = {'0': 'chat', '1': 'session', '2': 'todos', '3': 'files', '4': 'tools'};
/** Messages rendered while pinned to the bottom; scrolling up loads more. */
const CHAT_WINDOW = 40;
const WHEEL_STEP = 3;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function activityLabel(message: AssistantMessage | undefined): string {
	const last = message?.parts.at(-1);
	if (!last) return 'Thinking';
	if (last.type === 'tool' && last.call.status === 'running') return `Running ${last.call.name}`;
	return 'Writing';
}

interface Props {
	initialSettings: Settings;
	plugins?: PluginLoadReport;
}

export function App({initialSettings, plugins}: Props) {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const {columns, rows} = useTerminalSize();
	const [selection, setSelection] = useState(() => {
		const initial = defaultProvider();
		return {providerId: initial.id, model: initial.models[0]!.id};
	});
	const [loadedPlugins, setLoadedPlugins] = useState<LoadedPlugin[]>(plugins?.loaded ?? []);
	const catalog = useMemo(() => {
		try {
			return readCatalog();
		} catch {
			return [];
		}
	}, []);
	// The selected provider can disappear when its plugin is uninstalled.
	const provider = getProvider(selection.providerId) ?? defaultProvider();
	const model = selection.model;
	const modelLabel = provider.models.find(m => m.id === model)?.label ?? model;
	const apiKey = getApiKey(provider);
	const keySet = apiKey !== undefined;
	const [mode, setMode] = useState<Mode>('default');
	const [settings, setSettings] = useState(initialSettings);
	const [popup, setPopup] = useState<Popup>(null);
	const [focus, setFocus] = useState<FocusId>('prompt');
	const [inputHistory, setInputHistory] = useState<string[]>([]);
	const [footerNotice, setFooterNotice] = useState<string>();
	// Read back with readPicks() in handlers: several keys (a wheel burst) can land in one tick.
	const [picks, setPicks, readPicks] = useSyncState<Record<ListId, number>>({todos: 0, files: 0, tools: 0});
	const listStarts = useRef<Record<ListId, number>>({todos: 0, files: 0, tools: 0});
	const exitArmed = useRef(false);
	const noticeTimer = useRef<NodeJS.Timeout | null>(null);

	// Conversation scrolling: `chatTop` is rows scrolled past, or null when pinned to the newest output.
	const [chatTop, setChatTop, readChatTop] = useSyncState<number | null>(null);
	const [chatStart, setChatStart] = useState(0);
	const [chatHeight, setChatHeight] = useState(0);
	const chatHeightRef = useRef(0);
	const growingTop = useRef(false);
	// The detail view (a file, tool output, the plan) scrolls from its top.
	const [detailTop, setDetailTop, readDetailTop] = useSyncState(0);
	const [detailHeight, setDetailHeight] = useState(0);

	const theme = useMemo(() => createTheme(settings.unicode), [settings.unicode]);
	const chat = useChat({provider, apiKey, model, simulateErrors: settings.simulateErrors});
	const messages = useMemo(() => [...chat.history, ...chat.live], [chat.history, chat.live]);
	const calls = useMemo(() => toolCalls(messages), [messages]);
	const files = useMemo(() => changedFiles(messages), [messages]);
	const todos = chat.todos;
	const counts: Record<ListId, number> = {todos: todos.length, files: files.length, tools: calls.length};
	const pick: Record<ListId, number> = {
		todos: clamp(picks.todos, 0, Math.max(0, todos.length - 1)),
		files: clamp(picks.files, 0, Math.max(0, files.length - 1)),
		tools: clamp(picks.tools, 0, Math.max(0, calls.length - 1)),
	};
	const modal = popup !== null || chat.pendingAsk !== null;

	useEffect(() => () => {
		if (noticeTimer.current) clearTimeout(noticeTimer.current);
	}, []);

	// Surface plugin problems once at startup; a broken plugin never blocks the app.
	useEffect(() => {
		for (const {file, message} of plugins?.errors ?? []) chat.notify('error', `Plugin ${file} failed to load: ${message}`);
	}, []);

	// Pull the whole OpenRouter catalog in the background. The curated list is
	// already on screen, so nothing waits on this and a failure changes nothing.
	useEffect(() => {
		if (process.env.TOOLCODE_NO_MODEL_SCRAPE === '1') return;
		const controller = new AbortController();
		refreshOpenRouterModels(controller.signal).catch(() => {});
		return () => controller.abort();
	}, []);

	// Plugin logs arrive here instead of scribbling over the screen (see cli.tsx).
	useEffect(() => onConsole((level, text) => chat.notify(level, text)), []);

	// Mouse reporting is a terminal mode: switch it on only while the setting is.
	useEffect(() => {
		if (!settings.mouse) return;
		stdout.write(MOUSE_ON);
		return () => {
			stdout.write(MOUSE_OFF);
		};
	}, [settings.mouse, stdout]);

	const flashFooter = useCallback((text: string, ms = 2000) => {
		setFooterNotice(text);
		if (noticeTimer.current) clearTimeout(noticeTimer.current);
		noticeTimer.current = setTimeout(() => {
			setFooterNotice(undefined);
			exitArmed.current = false;
		}, ms);
	}, []);

	const quit = () => {
		const turns = messages.filter(m => m.role === 'user').length;
		exit({turns, files} satisfies ExitSummary);
	};

	const selectModel = (next: Provider, modelId: string, label: string) => {
		setSelection({providerId: next.id, model: modelId});
		const needsKey = getApiKey(next) === undefined;
		chat.notify(
			needsKey ? 'warning' : 'success',
			`Model set to ${label} (${next.name})${needsKey ? `. Run /auth or set ${next.apiKeyEnv} to use it; replies are demo until then.` : ''}`,
		);
	};

	const saveKey = (target: Provider, key: string) => {
		try {
			setStoredKey(target.id, key);
		} catch (error) {
			chat.notify('error', `Could not save the key: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}
		setPopup(popup?.kind === 'auth' && popup.returnTo ? {kind: popup.returnTo} : null);
		if (process.env[target.apiKeyEnv!]?.trim()) {
			chat.notify('warning', `Saved API key for ${target.name}, but ${target.apiKeyEnv} is set and takes precedence.`);
		} else {
			chat.notify('success', `Saved API key for ${target.name}.`);
		}
	};

	const removeKey = (target: Provider) => {
		try {
			if (removeStoredKey(target.id)) chat.notify('info', `Removed saved API key for ${target.name}.`);
			else chat.notify('info', `No saved API key for ${target.name}.`);
		} catch (error) {
			chat.notify('error', `Could not remove the key: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const toggleInstall = async (entry: CatalogEntry): Promise<string> => {
		if (isInstalled(entry)) {
			const loaded = loadedPlugins.find(p => path.resolve(p.file) === path.resolve(installPath(entry)));
			uninstall(entry, loaded);
			setLoadedPlugins(list => list.filter(p => p !== loaded));
			if (loaded?.providers.includes(provider.id)) {
				const fallback = defaultProvider();
				setSelection({providerId: fallback.id, model: fallback.models[0]!.id});
			}
			return `Uninstalled ${entry.name}.`;
		}
		const loaded = await install(entry);
		setLoadedPlugins(list => [...list, loaded]);
		const hints = [
			loaded.commands.length > 0 && `try ${loaded.commands.join(', ')}`,
			loaded.providers.length > 0 && 'pick it in /model',
			loaded.tools.length > 0 && `the model can now use ${loaded.tools.join(', ')}`,
		].filter(Boolean);
		return `Installed ${entry.name}${hints.length > 0 ? `: ${hints.join('; ')}` : ''}.`;
	};

	// ---- focus and lists -------------------------------------------------

	const setPick = (list: ListId, index: number) => setPicks(p => ({...p, [list]: clamp(index, 0, Math.max(0, counts[list] - 1))}));
	const movePick = (list: ListId, delta: number) => setPick(list, clamp(readPicks()[list], 0, Math.max(0, counts[list] - 1)) + delta);

	/** Focus a panel; lists start on their most useful row. */
	const focusPanel = (target: FocusId) => {
		if (target === focus) return;
		if (target === 'tools') setPick('tools', calls.length - 1);
		if (target === 'todos') {
			const open = todos.findIndex(t => t.status !== 'done');
			setPick('todos', open === -1 ? 0 : open);
		}
		setFocus(target);
	};

	const cycleFocus = () => focusPanel(FOCUS_ORDER[(FOCUS_ORDER.indexOf(focus) + 1) % FOCUS_ORDER.length]!);

	const handleCtrlC = () => {
		if (chat.busy) return chat.cancel();
		if (exitArmed.current) return quit();
		exitArmed.current = true;
		flashFooter('Press ctrl+c again to exit');
	};

	const togglePlan = () => setMode(m => (m === 'plan' ? 'default' : 'plan'));

	const runCommand = (input: string) => {
		const {name, args} = parseCommand(input);
		switch (name) {
			case '/help':
				setPopup({kind: 'help'});
				break;
			case '/model': {
				const match = findModel(args);
				if (match) {
					selectModel(match.provider, match.modelId, match.label);
				} else {
					if (args) chat.notify('warning', `Unknown model "${args}". Pick one from the list.`);
					setPopup({kind: 'model'});
				}
				break;
			}
			case '/auth': {
				if (!args) {
					setPopup({kind: 'auth'});
					break;
				}
				const q = args.toLowerCase();
				const target = providers.find(p => p.id.toLowerCase() === q || p.name.toLowerCase() === q);
				if (!target) {
					chat.notify('warning', `Unknown provider "${args}". Pick one from the list.`);
					setPopup({kind: 'auth'});
				} else if (!target.apiKeyEnv) {
					chat.notify('info', `${target.name} needs no API key.`);
				} else {
					setPopup({kind: 'auth', initial: target.id});
				}
				break;
			}
			case '/plan':
				if (args) {
					setMode('plan');
					setChatTop(null);
					void chat.send({prompt: args, display: input, kind: 'plan'});
				} else {
					const next = mode === 'plan' ? 'default' : 'plan';
					setMode(next);
					chat.notify('info', next === 'plan' ? 'Plan mode on: TOOLCODE will plan without changing files.' : 'Plan mode off.');
				}
				break;
			case '/improve':
				setChatTop(null);
				void chat.send({prompt: args, display: input, kind: 'improve'});
				break;
			case '/judge':
				if (!chat.lastAssistant) chat.notify('warning', 'Nothing to judge yet. Ask something first.');
				else {
					setChatTop(null);
					void chat.send({prompt: '', display: input, kind: 'judge'});
				}
				break;
			case '/retry':
				if (!chat.retry()) chat.notify('warning', 'Nothing to retry yet.');
				else setChatTop(null);
				break;
			case '/clear':
				chat.clear();
				setChatTop(null);
				setChatStart(0);
				setPicks({todos: 0, files: 0, tools: 0});
				break;
			case '/plugins': {
				if (loadedPlugins.length === 0) {
					chat.notify('info', 'No plugins loaded. Browse /marketplace, drop .js files in ~/.toolcode/plugins, or pass --plugin <path>.');
				} else {
					const lines = loadedPlugins.map(p => {
						const parts = [
							p.tools.length > 0 && `tools: ${p.tools.join(', ')}`,
							p.providers.length > 0 && `providers: ${p.providers.join(', ')}`,
							p.commands.length > 0 && `commands: ${p.commands.join(', ')}`,
						];
						return `${p.name} (${parts.filter(Boolean).join('; ')})`;
					});
					chat.notify('info', `Plugins:\n${lines.join('\n')}`);
				}
				break;
			}
			case '/marketplace':
				setPopup({kind: 'marketplace'});
				break;
			case '/config':
				setPopup({kind: 'config'});
				break;
			case '/exit':
			case '/quit':
				quit();
				break;
			default: {
				const command = getCommand(name);
				if (!command) {
					chat.notify('error', `Unknown command ${name}. Type /help to see what's available.`);
					break;
				}
				// Plugin commands may be async; whatever they return is shown as the reply.
				Promise.resolve()
					.then(() => command.run(args, {cwd: process.cwd()}))
					.then(result => {
						if (result !== undefined && result !== null && result !== '') chat.commandReply(input, String(result));
					})
					.catch(error => chat.notify('error', `${name} failed: ${error instanceof Error ? error.message : String(error)}`));
			}
		}
	};

	const handleSubmit = (text: string) => {
		setInputHistory(h => (h.at(-1) === text ? h : [...h, text]));
		const trimmed = text.trim();
		if (trimmed.startsWith('/')) return runCommand(trimmed);
		setChatTop(null);
		void chat.send({prompt: trimmed, display: text, kind: mode === 'plan' ? 'plan' : 'chat'});
	};

	const prompt = usePrompt({
		active: focus === 'prompt' && !modal,
		busy: chat.busy,
		history: inputHistory,
		onSubmit: handleSubmit,
		onCtrlC: handleCtrlC,
		onBusySubmit: () => flashFooter('Still responding (esc to interrupt)'),
		onTabEmpty: cycleFocus,
	});

	// ---- layout ------------------------------------------------------------

	const openTodos = todos.filter(t => t.status !== 'done').length;
	const layout = computeLayout({
		columns,
		rows,
		promptLines: prompt.state.value.split('\n').length,
		wants: {todos: todos.length > 0 ? todos.length + 1 : 1, files: Math.max(1, files.length), tools: Math.max(1, calls.length)},
		openTodos,
		focus,
	});
	const viewport = Math.max(1, layout.main.height - 2);
	const page = Math.max(1, viewport - 2);
	const panelOf = (id: SidePanelId) => layout.sidebar.find(p => p.id === id);
	const listRows: Record<ListId, number> = {
		todos: Math.max(0, (panelOf('todos')?.height ?? 0) - 3),
		files: Math.max(0, (panelOf('files')?.height ?? 0) - 2),
		tools: Math.max(0, (panelOf('tools')?.height ?? 0) - 2),
	};
	const firstOpen = Math.max(0, todos.findIndex(t => t.status !== 'done'));
	// Unfocused lists follow the action: the next open task, the newest file and tool call.
	const anchors: Record<ListId, number> = {
		todos: focus === 'todos' ? pick.todos : firstOpen,
		files: focus === 'files' ? pick.files : files.length - 1,
		tools: focus === 'tools' ? pick.tools : calls.length - 1,
	};
	const starts: Record<ListId, number> = {
		todos: windowStart(todos.length, listRows.todos, anchors.todos, listStarts.current.todos),
		files: windowStart(files.length, listRows.files, anchors.files, listStarts.current.files),
		tools: windowStart(calls.length, listRows.tools, anchors.tools, listStarts.current.tools),
	};
	listStarts.current = starts;

	// ---- main view: the conversation, or details of the focused side panel -----

	let detail: Detail | null = null;
	let detailEmpty = '';
	if (focus === 'session') {
		detail = {kind: 'session', providers, plugins: loadedPlugins, settings, cwd: process.cwd(), currentProvider: provider.id};
	} else if (focus === 'todos') {
		detail = {kind: 'plan', todos, selected: pick.todos};
	} else if (focus === 'files') {
		const file = files[pick.files];
		if (file) detail = {kind: 'file', file};
		else detailEmpty = 'No files changed yet. Files the agent creates, edits or deletes show up here.';
	} else if (focus === 'tools') {
		const call = calls[pick.tools];
		if (call) detail = {kind: 'tool', call};
		else detailEmpty = 'No tool calls yet. Every file read, write and plugin call shows up here.';
	}
	const showingChat = detail === null && detailEmpty === '';
	const detailKey = `${focus}:${focus === 'todos' || focus === 'files' || focus === 'tools' ? pick[focus] : 0}`;
	useEffect(() => setDetailTop(0), [detailKey]);

	const maxChatTop = Math.max(0, chatHeight - viewport);
	const shownChatTop = chatTop !== null && chatTop < maxChatTop ? chatTop : null;
	const pinnedStart = Math.max(0, messages.length - CHAT_WINDOW);
	const renderStart = shownChatTop === null ? pinnedStart : Math.min(chatStart, pinnedStart);
	const maxDetailTop = Math.max(0, detailHeight - viewport);
	const shownDetailTop = Math.min(detailTop, maxDetailTop);

	const onChatMeasure = useCallback((height: number) => {
		const previous = chatHeightRef.current;
		if (height === previous) return;
		chatHeightRef.current = height;
		// Older messages were just rendered above: keep the same lines in view.
		if (growingTop.current) {
			growingTop.current = false;
			setChatTop(top => (top === null ? null : top + (height - previous)));
		}
		setChatHeight(height);
	}, []);
	const onDetailMeasure = useCallback((height: number) => setDetailHeight(height), []);

	const scrollChat = (delta: number) => {
		const latest = readChatTop();
		const shown = latest !== null && latest < maxChatTop ? latest : null;
		const current = shown ?? maxChatTop;
		const next = clamp(current + delta, 0, maxChatTop);
		if (next >= maxChatTop) return setChatTop(null);
		if (shown === null) setChatStart(renderStart);
		setChatTop(next);
		if (next === 0 && renderStart > 0) {
			growingTop.current = true;
			setChatStart(Math.max(0, renderStart - CHAT_WINDOW));
		}
	};
	const scrollMain = (delta: number) => {
		if (showingChat) return scrollChat(delta);
		setDetailTop(clamp(Math.min(readDetailTop(), maxDetailTop) + delta, 0, maxDetailTop));
	};

	// ---- input -------------------------------------------------------------

	const handleMouse = (event: MouseEvent) => {
		const side = layout.sidebar.find(p => contains(p, event.x, event.y));
		if (event.kind === 'wheelUp' || event.kind === 'wheelDown') {
			const direction = event.kind === 'wheelUp' ? -1 : 1;
			if (side && side.id !== 'session') {
				focusPanel(side.id);
				if (focus === side.id) movePick(side.id, direction);
				else setPick(side.id, anchors[side.id] + direction);
			} else {
				scrollMain(direction * WHEEL_STEP);
			}
			return;
		}
		if (event.kind !== 'press' || event.button !== 0) return;
		if (contains(layout.prompt, event.x, event.y)) return setFocus('prompt');
		if (contains(layout.main, event.x, event.y)) {
			if (focus === 'prompt') setFocus('chat');
			return;
		}
		if (!side) return;
		focusPanel(side.id);
		if (side.id === 'session') return;
		// Row under the pointer: skip the border, and the progress bar in Todos.
		const row = event.y - side.y - 1 - (side.id === 'todos' && todos.length > 0 ? 1 : 0);
		if (row >= 0 && row < listRows[side.id] && starts[side.id] + row < counts[side.id]) setPick(side.id, starts[side.id] + row);
	};

	// App-wide keys. The prompt and popups handle their own; this sees every key too.
	useKeys((input, key) => {
		if (modal) return;
		const mouse = parseMouse(input);
		if (mouse) return handleMouse(mouse);
		if (key.ctrl && input === 'o') return setSettings(s => ({...s, expandTools: !s.expandTools}));
		if (key.ctrl && input === 'l') {
			// Repaint from scratch, e.g. after another program wrote over the screen.
			stdout.write('\x1b[2J\x1b[H');
			return flashFooter('Redrew the screen', 1200);
		}
		if (key.tab && key.shift) return togglePlan();
		if (key.pageUp) return scrollMain(-page);
		if (key.pageDown) return scrollMain(page);

		if (focus === 'prompt') {
			if (key.escape && chat.busy && !prompt.menuOpen) chat.cancel();
			return;
		}

		// A panel has focus: vim-ish movement, esc or i to type again.
		if (key.ctrl && input === 'c') return handleCtrlC();
		if (key.escape || input === 'i' || key.return) return setFocus('prompt');
		if (key.tab) return cycleFocus();
		if (input === '?') return setPopup({kind: 'help'});
		const jump = PANEL_KEYS[input];
		if (jump) return focusPanel(jump);
		const up = key.upArrow || input === 'k';
		const down = key.downArrow || input === 'j';
		const first = input === 'g' || key.home;
		const last = input === 'G' || key.end;
		if (focus === 'chat' || focus === 'session') {
			if (up) scrollMain(-1);
			if (down) scrollMain(1);
			if (first) scrollMain(-Infinity);
			if (last) scrollMain(Infinity);
			return;
		}
		if (up) movePick(focus, -1);
		if (down) movePick(focus, 1);
		if (first) setPick(focus, 0);
		if (last) setPick(focus, counts[focus] - 1);
	});

	// ---- rendering -----------------------------------------------------------

	const lastLive = chat.live.at(-1);
	const draft = lastLive?.role === 'assistant' && lastLive.status === 'streaming' ? lastLive : undefined;
	const narrow = layout.sidebar.length === 0;
	const keyIndicator = keySet ? '' : ` ${theme.symbols.warning}`;

	const hints: Hint[] = modal
		? [['esc', chat.pendingAsk ? 'skip the questions' : 'close']]
		: focus === 'prompt'
			? chat.busy
				? [
						['esc', 'interrupt'],
						['pgup/pgdn', 'scroll'],
						['tab', 'panels'],
					]
				: [
						[theme.symbols.keyEnter, 'send'],
						['/', 'commands'],
						['tab', 'panels'],
						['pgup/pgdn', 'scroll'],
						['shift+tab', 'plan'],
						['?', 'keys'],
					]
			: focus === 'chat' || focus === 'session'
				? [
						['j/k', 'scroll'],
						['pgup/pgdn', 'page'],
						['g/G', 'top/bottom'],
						['tab', 'next'],
						['0-4', 'jump'],
						['esc', 'prompt'],
					]
				: [
						['j/k', 'select'],
						['pgup/pgdn', 'scroll'],
						['g/G', 'first/last'],
						['tab', 'next'],
						['0-4', 'jump'],
						['esc', 'prompt'],
					];

	const {colors, symbols} = theme;
	const barRight = footerNotice ? (
		<Text color={colors.warning}>{footerNotice}</Text>
	) : chat.busy ? (
		<ActivityIndicator label={chat.pendingAsk ? 'Waiting for your answer' : activityLabel(draft)} startedAt={chat.startedAt} />
	) : (
		<Text color={colors.muted}>{narrow ? `${modelLabel}${keyIndicator}` : `v${VERSION}`}</Text>
	);

	const mainTitle = {prompt: 'Chat', chat: 'Chat', session: 'Overview', todos: 'Plan', files: 'File', tools: 'Output'}[focus];
	const chatBelow = shownChatTop === null ? 0 : Math.max(0, chatHeight - viewport - shownChatTop);
	const mainFooter = showingChat ? (
		chatBelow > 0 ? (
			<Text color={colors.warning}>
				{chatBelow} more {symbols.arrowDown}
			</Text>
		) : undefined
	) : maxDetailTop > 0 ? (
		<Text color={colors.muted}>{Math.round((shownDetailTop / maxDetailTop) * 100)}%</Text>
	) : undefined;
	const mainStatus =
		focus === 'files' || focus === 'tools' ? (
			counts[focus] > 0 && (
				<Text color={colors.muted}>
					{pick[focus] + 1} of {counts[focus]}
				</Text>
			)
		) : narrow ? (
			<Text color={keySet ? colors.muted : colors.warning}>
				{modelLabel}
				{keyIndicator}
			</Text>
		) : undefined;

	const mainScroll = showingChat
		? {offset: shownChatTop ?? maxChatTop, total: chatHeight, visible: viewport}
		: {offset: shownDetailTop, total: detailHeight, visible: viewport};

	const popupWidth = (max: number) => Math.min(max, Math.max(20, columns - 4));
	const popupMaxHeight = Math.max(6, layout.height - 2);

	if (layout.tooSmall) {
		return (
			<ThemeProvider theme={theme}>
				<Box width={columns} height={Math.max(1, rows - 1)} alignItems="center" justifyContent="center" flexDirection="column">
					<Text color={colors.warning}>Terminal too small</Text>
					<Text color={colors.muted}>
						{columns}x{rows}, need 40x12
					</Text>
				</Box>
			</ThemeProvider>
		);
	}

	return (
		<ThemeProvider theme={theme}>
			<Box flexDirection="column" width={layout.width} height={layout.height}>
				<Box height={layout.main.height} flexShrink={0}>
					{!narrow && (
						<Box flexDirection="column" width={layout.sidebar[0]!.width} flexShrink={0}>
							{layout.sidebar.map(panel => {
								const focused = !modal && focus === panel.id;
								switch (panel.id) {
									case 'session':
										return (
											<SessionPanel
												key="session"
												width={panel.width}
												height={panel.height}
												focused={focused}
												compact={layout.compactSession}
												cwd={tildePath(process.cwd(), os.homedir())}
												providerName={provider.name}
												modelLabel={modelLabel}
												keySource={keySource(provider)}
												mode={mode}
											/>
										);
									case 'todos':
										return (
											<TodosPanel
												key="todos"
												width={panel.width}
												height={panel.height}
												focused={focused}
												todos={todos}
												selected={pick.todos}
												start={starts.todos}
											/>
										);
									case 'files':
										return (
											<FilesPanel
												key="files"
												width={panel.width}
												height={panel.height}
												focused={focused}
												files={files}
												selected={pick.files}
												start={starts.files}
											/>
										);
									case 'tools':
										return (
											<ToolsPanel
												key="tools"
												width={panel.width}
												height={panel.height}
												focused={focused}
												calls={calls}
												selected={pick.tools}
												start={starts.tools}
											/>
										);
								}
							})}
						</Box>
					)}
					<Panel
						title={mainTitle}
						index={0}
						focused={!modal && focus === 'chat'}
						width={layout.main.width}
						height={layout.main.height}
						status={mainStatus}
						footer={mainFooter}
						scroll={mainScroll}
						justify={showingChat ? (messages.length === 0 ? 'center' : shownChatTop === null ? 'flex-end' : 'flex-start') : 'flex-start'}
					>
						{showingChat ? (
							messages.length === 0 ? (
								<Welcome
									width={layout.main.width - 4}
									modelLabel={modelLabel}
									missingKey={keySet ? undefined : {provider: provider.name, env: provider.apiKeyEnv ?? ''}}
								/>
							) : (
								<ChatView
									messages={messages}
									start={renderStart}
									viewport={viewport}
									top={shownChatTop}
									expandTools={settings.expandTools}
									onMeasure={onChatMeasure}
								/>
							)
						) : (
							<ScrollBox top={shownDetailTop} onMeasure={onDetailMeasure}>
								{detail ? <DetailView detail={detail} top={shownDetailTop} viewport={viewport} /> : <Text color={colors.muted}>{detailEmpty}</Text>}
							</ScrollBox>
						)}
					</Panel>
				</Box>
				{layout.todoStrip && (
					<Panel
						title="Todos"
						width={layout.todoStrip.width}
						height={layout.todoStrip.height}
						footer={
							<Text color={colors.muted}>
								{todos.length - openTodos}/{todos.length}
							</Text>
						}
					>
						{todos
							.filter(t => t.status !== 'done')
							.slice(0, layout.todoStrip.height - 2)
							.map(todo => (
								<TodoRow key={todo.id} todo={todo} todos={todos} selected={false} />
							))}
					</Panel>
				)}
				<PromptPanel
					width={layout.prompt.width}
					height={layout.prompt.height}
					state={prompt.state}
					focused={!modal && focus === 'prompt'}
					away={!modal && focus !== 'prompt'}
					busy={chat.busy}
					mode={mode}
					hint={chat.pendingAsk ? `Answer the question above${theme.symbols.ellipsis}` : undefined}
				/>
				<KeyBar width={layout.keybar.width} hints={hints} right={barRight} />

				{!modal && focus === 'prompt' && prompt.menuOpen && (
					<Overlay width={layout.width} height={layout.height} at={{x: 2, y: Math.max(0, layout.prompt.y - 1 - menuHeight(prompt.suggestions.length))}}>
						<CommandMenu items={prompt.suggestions} selected={prompt.selected} width={popupWidth(72)} />
					</Overlay>
				)}
				{!modal && focus === 'prompt' && prompt.state.value === '?' && (
					<Overlay width={layout.width} height={layout.height} at={{x: 2, y: Math.max(0, layout.prompt.y - 1 - keysPopupHeight(popupWidth(110)))}}>
						<KeysPopup width={popupWidth(110)} />
					</Overlay>
				)}
				{modal && (
					<Overlay width={layout.width} height={layout.height}>
						{chat.pendingAsk ? (
							<AskPanel key={chat.pendingAsk.id} questions={chat.pendingAsk.questions} width={popupWidth(80)} onDone={chat.pendingAsk.answer} />
						) : popup?.kind === 'model' ? (
							<ModelPicker
								providers={providers}
								currentProvider={provider.id}
								current={model}
								width={popupWidth(88)}
								maxHeight={popupMaxHeight}
								onSelect={(p, m) => {
									selectModel(p, m.id, m.label);
									setPopup(popup.returnTo ? {kind: popup.returnTo} : null);
								}}
								onCancel={() => setPopup(popup.returnTo ? {kind: popup.returnTo} : null)}
							/>
						) : popup?.kind === 'auth' ? (
							<AuthPanel
								providers={providers}
								initial={popup.initial}
								width={popupWidth(68)}
								onSave={saveKey}
								onRemove={removeKey}
								onClose={() => setPopup(popup.returnTo ? {kind: popup.returnTo} : null)}
							/>
						) : popup?.kind === 'config' ? (
							<ConfigPanel
								width={popupWidth(68)}
								provider={provider}
								modelLabel={modelLabel}
								keySet={keySet}
								settings={settings}
								onChange={setSettings}
								onOpenModel={() => setPopup({kind: 'model', returnTo: 'config'})}
								onOpenAuth={() => setPopup({kind: 'auth', initial: provider.apiKeyEnv ? provider.id : undefined, returnTo: 'config'})}
								onClose={() => setPopup(null)}
							/>
						) : popup?.kind === 'marketplace' ? (
							<MarketplaceScreen
								entries={catalog}
								installed={isInstalled}
								width={popupWidth(96)}
								maxHeight={popupMaxHeight}
								onToggle={toggleInstall}
								onClose={() => setPopup(null)}
							/>
						) : popup?.kind === 'help' ? (
							<HelpModal width={popupWidth(80)} maxHeight={popupMaxHeight} onClose={() => setPopup(null)} />
						) : null}
					</Overlay>
				)}
			</Box>
		</ThemeProvider>
	);
}
