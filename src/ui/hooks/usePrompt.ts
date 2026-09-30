import {matchCommands, type SlashCommand} from '../commands.js';
import * as editor from '../editor.js';
import {isMouseInput} from '../mouse.js';
import {useKeys} from './useKeys.js';
import {useSyncState} from './useSyncState.js';

interface Options {
	/** Only the focused prompt with no popup open reads keys. */
	active: boolean;
	busy: boolean;
	/** Past submissions, oldest first. */
	history: string[];
	onSubmit: (text: string) => void;
	/** Ctrl+C pressed with an empty input. */
	onCtrlC: () => void;
	/** Enter pressed while a response is still streaming; the text is kept. */
	onBusySubmit: () => void;
	/** Tab with nothing typed: move focus to the panels. */
	onTabEmpty: () => void;
}

export interface Prompt {
	state: editor.EditorState;
	suggestions: SlashCommand[];
	selected: number;
	menuOpen: boolean;
}

interface Model {
	state: editor.EditorState;
	/** -1 while editing a fresh draft; otherwise an index counted back from the newest entry. */
	historyIndex: number;
	/** The unsent text, kept while browsing history. */
	draft: string;
	menuIndex: number;
	menuDismissed: boolean;
}

const EMPTY: Model = {state: editor.emptyEditor, historyIndex: -1, draft: '', menuIndex: 0, menuDismissed: false};

function menuOf(model: Model) {
	const suggestions = matchCommands(model.state.value);
	return {
		suggestions,
		menuOpen: suggestions.length > 0 && !model.menuDismissed,
		selected: Math.min(model.menuIndex, suggestions.length - 1),
	};
}

/**
 * The prompt editor: text, cursor, history recall and the slash-command
 * menu. It owns the keys while active; rendering is left to the caller so
 * the menu can float above the rest of the layout.
 */
export function usePrompt({active, busy, history, onSubmit, onCtrlC, onBusySubmit, onTabEmpty}: Options): Prompt {
	const [model, setModel, read] = useSyncState<Model>(EMPTY);

	const edit = (next: editor.EditorState) =>
		setModel(m => (next.value === m.state.value ? {...m, state: next} : {...m, state: next, menuIndex: 0, menuDismissed: false, historyIndex: -1}));
	const move = (next: editor.EditorState) => setModel(m => ({...m, state: next}));

	const recall = (index: number) =>
		setModel(m => {
			const draft = m.historyIndex === -1 ? m.state.value : m.draft;
			return {...m, draft, historyIndex: index, state: editor.fromText(index === -1 ? draft : history[history.length - 1 - index]!)};
		});

	const submit = (text: string) => {
		if (!text.trim()) return;
		if (busy) return onBusySubmit();
		onSubmit(text);
		setModel(EMPTY);
	};

	useKeys(
		(input, key) => {
			if (isMouseInput(input)) return;
			const current = read();
			const {state} = current;
			const {suggestions, menuOpen, selected} = menuOf(current);

			if (key.ctrl && input === 'c') {
				if (state.value) edit(editor.emptyEditor);
				else onCtrlC();
				return;
			}

			if (menuOpen) {
				if (key.upArrow) return setModel(m => ({...m, menuIndex: (selected - 1 + suggestions.length) % suggestions.length}));
				if (key.downArrow) return setModel(m => ({...m, menuIndex: (selected + 1) % suggestions.length}));
				if (key.tab && !key.shift) {
					const command = suggestions[selected]!;
					return edit(editor.fromText(command.args ? `${command.name} ` : command.name));
				}
				if (key.escape) return setModel(m => ({...m, menuDismissed: true}));
				if (key.return && !key.meta) return submit(suggestions[selected]!.name);
			}

			if (key.tab && !key.shift && state.value === '') return onTabEmpty();

			// Newline: alt+enter, ctrl+j ("\n"), or a trailing backslash before enter.
			if ((key.return && key.meta) || input === '\n') return edit(editor.insert(state, '\n'));
			if (key.return) {
				if (state.value[state.cursor - 1] === '\\') {
					return edit(editor.insert(editor.backspace(state), '\n'));
				}
				return submit(state.value);
			}

			if (key.upArrow) {
				const moved = editor.moveVertical(state, -1);
				if (moved) return move(moved);
				if (current.historyIndex < history.length - 1) recall(current.historyIndex + 1);
				return;
			}
			if (key.downArrow) {
				const moved = editor.moveVertical(state, 1);
				if (moved) return move(moved);
				if (current.historyIndex >= 0) recall(current.historyIndex - 1);
				return;
			}
			if (key.leftArrow) return move(editor.moveLeft(state));
			if (key.rightArrow) return move(editor.moveRight(state));
			if (key.home || (key.ctrl && input === 'a')) return move(editor.lineStart(state));
			if (key.end || (key.ctrl && input === 'e')) return move(editor.lineEnd(state));
			// Most terminals send DEL (0x7f) for backspace, which Ink reports as "delete".
			if (key.backspace || key.delete) return edit(editor.backspace(state));

			if (key.ctrl) {
				if (input === 'd') return edit(editor.deleteForward(state));
				if (input === 'u') return edit(editor.killToStart(state));
				if (input === 'k') return edit(editor.killToEnd(state));
				if (input === 'w') return edit(editor.deleteWordBefore(state));
				return; // other ctrl combos are global shortcuts handled by the app
			}
			if (key.meta || key.tab || key.escape || key.pageUp || key.pageDown) return;

			if (input) {
				const text = input.length > 1 ? editor.sanitizePaste(input) : input;
				if (text) edit(editor.insert(state, text));
			}
		},
		{isActive: active},
	);

	return {state: model.state, ...menuOf(model)};
}
