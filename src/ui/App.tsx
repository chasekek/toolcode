import path from 'node:path';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, useApp, useInput, useStdout} from 'ink';
import type {AssistantMessage, Mode, Settings} from '../core/types.js';
import {getCommand} from '../core/commands.js';
import type {PluginLoadReport} from '../plugins/loader.js';
import {install, installPath, isInstalled, readCatalog, uninstall, type CatalogEntry} from '../plugins/marketplace.js';
import type {LoadedPlugin} from '../plugins/types.js';
import {defaultProvider, findModel, getApiKey, getProvider, providers} from '../providers/registry.js';
import type {Provider} from '../providers/types.js';
import {parseCommand} from './commands.js';
import {useChat} from './hooks/useChat.js';
import {useTerminalWidth} from './hooks/useTerminalWidth.js';
import {createTheme, ThemeProvider} from './theme.js';
import {Conversation} from './components/Conversation.js';
import {InputBox} from './components/InputBox.js';
import {Footer} from './components/Footer.js';
import {ModelPicker} from './components/ModelPicker.js';
import {ConfigPanel} from './components/ConfigPanel.js';
import {ActivityIndicator} from './components/Spinner.js';
import {MarketplacePanel} from './components/MarketplacePanel.js';
import {AskPanel} from './components/AskPanel.js';
import {TodoPanel} from './components/TodoPanel.js';

type Overlay = null | {kind: 'model'; returnTo?: 'config'} | {kind: 'config'} | {kind: 'marketplace'};

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
	const width = useTerminalWidth();
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
	const apiKey = getApiKey(provider);
	const keySet = apiKey !== undefined;
	const [mode, setMode] = useState<Mode>('default');
	const [settings, setSettings] = useState(initialSettings);
	const [overlay, setOverlay] = useState<Overlay>(null);
	const [inputHistory, setInputHistory] = useState<string[]>([]);
	const [epoch, setEpoch] = useState(0);
	const [footerNotice, setFooterNotice] = useState<string>();
	const exitArmed = useRef(false);
	const noticeTimer = useRef<NodeJS.Timeout | null>(null);

	const theme = useMemo(() => createTheme(settings.unicode), [settings.unicode]);
	const chat = useChat({provider, apiKey, model, simulateErrors: settings.simulateErrors});

	useEffect(() => () => {
		if (noticeTimer.current) clearTimeout(noticeTimer.current);
	}, []);

	// Surface plugin problems once at startup; a broken plugin never blocks the app.
	useEffect(() => {
		for (const {file, message} of plugins?.errors ?? []) chat.notify('error', `Plugin ${file} failed to load: ${message}`);
	}, []);

	const selectModel = (next: Provider, modelId: string, label: string) => {
		setSelection({providerId: next.id, model: modelId});
		const needsKey = getApiKey(next) === undefined;
		chat.notify(
			needsKey ? 'warning' : 'success',
			`Model set to ${label} (${next.name})${needsKey ? `. Set ${next.apiKeyEnv} to use it; replies are demo until then.` : ''}`,
		);
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

	const flashFooter = useCallback((text: string, ms = 2000) => {
		setFooterNotice(text);
		if (noticeTimer.current) clearTimeout(noticeTimer.current);
		noticeTimer.current = setTimeout(() => {
			setFooterNotice(undefined);
			exitArmed.current = false;
		}, ms);
	}, []);

	const clearScreen = useCallback(() => {
		stdout.write('\x1b[2J\x1b[3J\x1b[H');
		setEpoch(e => e + 1);
	}, [stdout]);

	const togglePlan = useCallback(() => {
		setMode(m => (m === 'plan' ? 'default' : 'plan'));
	}, []);

	const runCommand = (input: string) => {
		const {name, args} = parseCommand(input);
		switch (name) {
			case '/help':
				chat.showHelp();
				break;
			case '/model': {
				const match = findModel(args);
				if (match) {
					selectModel(match.provider, match.modelId, match.label);
				} else {
					if (args) chat.notify('warning', `Unknown model "${args}". Pick one from the list.`);
					setOverlay({kind: 'model'});
				}
				break;
			}
			case '/plan':
				if (args) {
					setMode('plan');
					void chat.send({prompt: args, display: input, kind: 'plan'});
				} else {
					const next = mode === 'plan' ? 'default' : 'plan';
					setMode(next);
					chat.notify('info', next === 'plan' ? 'Plan mode on: TOOLCODE will plan without changing files.' : 'Plan mode off.');
				}
				break;
			case '/improve':
				void chat.send({prompt: args, display: input, kind: 'improve'});
				break;
			case '/judge':
				if (!chat.lastAssistant) chat.notify('warning', 'Nothing to judge yet. Ask something first.');
				else void chat.send({prompt: '', display: input, kind: 'judge'});
				break;
			case '/retry':
				if (!chat.retry()) chat.notify('warning', 'Nothing to retry yet.');
				break;
			case '/clear':
				chat.clear();
				clearScreen();
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
				setOverlay({kind: 'marketplace'});
				break;
			case '/config':
				setOverlay({kind: 'config'});
				break;
			case '/exit':
			case '/quit':
				exit();
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
		void chat.send({prompt: trimmed, display: text, kind: mode === 'plan' ? 'plan' : 'chat'});
	};

	const handleCtrlC = () => {
		if (chat.busy) return chat.cancel();
		if (exitArmed.current) return exit();
		exitArmed.current = true;
		flashFooter('Press ctrl+c again to exit');
	};

	// App-wide shortcuts. Editing keys belong to InputBox; overlays handle their own.
	useInput((input, key) => {
		// While a question is open, esc skips it (handled by AskPanel) instead of interrupting.
		if (key.escape && chat.busy && !overlay && !chat.pendingAsk) chat.cancel();
		if (key.tab && key.shift && !overlay) togglePlan();
		if (key.ctrl && input === 'o') {
			setSettings(s => ({...s, expandTools: !s.expandTools}));
		}
		if (key.ctrl && input === 'l') clearScreen();
	});

	const lastLive = chat.live.at(-1);
	const draft = lastLive?.role === 'assistant' && lastLive.status === 'streaming' ? lastLive : undefined;

	return (
		<ThemeProvider theme={theme}>
			<Box flexDirection="column">
				<Conversation
					history={chat.history}
					live={chat.live}
					width={width}
					expandTools={settings.expandTools}
					epoch={epoch}
				/>
				{chat.busy && (
					<Box marginTop={1} paddingX={1}>
						<ActivityIndicator label={chat.pendingAsk ? 'Waiting for your answer' : activityLabel(draft)} startedAt={chat.startedAt} />
					</Box>
				)}
				<TodoPanel todos={chat.todos} />
				<Box marginTop={1} flexDirection="column">
					{chat.pendingAsk ? (
						<AskPanel key={chat.pendingAsk.id} questions={chat.pendingAsk.questions} width={width} onDone={chat.pendingAsk.answer} />
					) : overlay?.kind === 'model' ? (
						<ModelPicker
							providers={providers}
							currentProvider={provider.id}
							current={model}
							width={width}
							onSelect={(p, m) => {
								selectModel(p, m.id, m.label);
								setOverlay(overlay.returnTo ? {kind: overlay.returnTo} : null);
							}}
							onCancel={() => setOverlay(overlay.returnTo ? {kind: overlay.returnTo} : null)}
						/>
					) : overlay?.kind === 'marketplace' ? (
						<MarketplacePanel entries={catalog} installed={isInstalled} width={width} onToggle={toggleInstall} onClose={() => setOverlay(null)} />
					) : overlay?.kind === 'config' ? (
						<ConfigPanel
							width={width}
							provider={provider}
							model={model}
							keySet={keySet}
							settings={settings}
							onChange={setSettings}
							onOpenModel={() => setOverlay({kind: 'model', returnTo: 'config'})}
							onClose={() => setOverlay(null)}
						/>
					) : (
						<InputBox
							width={width}
							mode={mode}
							busy={chat.busy}
							history={inputHistory}
							onSubmit={handleSubmit}
							onCtrlC={handleCtrlC}
							onBusySubmit={() => flashFooter('Still responding (esc to interrupt)')}
						/>
					)}
					<Footer
						width={width}
						mode={mode}
						busy={chat.busy}
						notice={footerNotice}
						provider={provider}
						model={model}
						keySet={keySet}
					/>
				</Box>
			</Box>
		</ThemeProvider>
	);
}
