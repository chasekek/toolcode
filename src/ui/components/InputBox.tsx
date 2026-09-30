import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {Mode} from '../../core/types.js';
import {matchCommands} from '../commands.js';
import * as editor from '../editor.js';
import {useTheme} from '../theme.js';
import {CommandMenu} from './CommandMenu.js';
import {ShortcutsPanel} from './ShortcutsPanel.js';

interface Props {
	width: number;
	mode: Mode;
	busy: boolean;
	/** Past submissions, oldest first. */
	history: string[];
	onSubmit: (text: string) => void;
	/** Ctrl+C pressed with an empty input. */
	onCtrlC: () => void;
	/** Enter pressed while a response is still streaming; the text is kept. */
	onBusySubmit: () => void;
}

export function InputBox({width, mode, busy, history, onSubmit, onCtrlC, onBusySubmit}: Props) {
	const {colors, symbols, borderStyle} = useTheme();
	const [state, setState] = useState<editor.EditorState>(editor.emptyEditor);
	// -1 means editing a fresh draft; otherwise an index counted back from the newest entry.
	const [historyIndex, setHistoryIndex] = useState(-1);
	const [draft, setDraft] = useState('');
	const [menuIndex, setMenuIndex] = useState(0);
	const [menuDismissed, setMenuDismissed] = useState(false);

	const suggestions = matchCommands(state.value);
	const menuOpen = suggestions.length > 0 && !menuDismissed;
	const selected = Math.min(menuIndex, suggestions.length - 1);

	const edit = (next: editor.EditorState) => {
		if (next.value !== state.value) {
			setMenuIndex(0);
			setMenuDismissed(false);
			setHistoryIndex(-1);
		}
		setState(next);
	};

	const recall = (index: number) => {
		if (historyIndex === -1) setDraft(state.value);
		setHistoryIndex(index);
		setState(editor.fromText(index === -1 ? draft : history[history.length - 1 - index]!));
	};

	const submit = (text: string) => {
		if (!text.trim()) return;
		if (busy) return onBusySubmit();
		onSubmit(text);
		setState(editor.emptyEditor);
		setHistoryIndex(-1);
		setDraft('');
	};

	useInput((input, key) => {
		if (key.ctrl && input === 'c') {
			if (state.value) edit(editor.emptyEditor);
			else onCtrlC();
			return;
		}

		if (menuOpen) {
			if (key.upArrow) return setMenuIndex((selected - 1 + suggestions.length) % suggestions.length);
			if (key.downArrow) return setMenuIndex((selected + 1) % suggestions.length);
			if (key.tab && !key.shift) {
				const command = suggestions[selected]!;
				return edit(editor.fromText(command.args ? `${command.name} ` : command.name));
			}
			if (key.escape) return setMenuDismissed(true);
			if (key.return && !key.meta) return submit(suggestions[selected]!.name);
		}

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
			if (moved) return setState(moved);
			if (historyIndex < history.length - 1) recall(historyIndex + 1);
			return;
		}
		if (key.downArrow) {
			const moved = editor.moveVertical(state, 1);
			if (moved) return setState(moved);
			if (historyIndex >= 0) recall(historyIndex - 1);
			return;
		}
		if (key.leftArrow) return setState(editor.moveLeft(state));
		if (key.rightArrow) return setState(editor.moveRight(state));
		if (key.home || (key.ctrl && input === 'a')) return setState(editor.lineStart(state));
		if (key.end || (key.ctrl && input === 'e')) return setState(editor.lineEnd(state));
		// Most terminals send DEL (0x7f) for backspace, which Ink reports as "delete".
		if (key.backspace || key.delete) return edit(editor.backspace(state));

		if (key.ctrl) {
			if (input === 'd') return edit(editor.deleteForward(state));
			if (input === 'u') return edit(editor.killToStart(state));
			if (input === 'k') return edit(editor.killToEnd(state));
			if (input === 'w') return edit(editor.deleteWordBefore(state));
			return; // other ctrl combos are global shortcuts handled by the app
		}
		if (key.meta || key.tab || key.escape) return;

		if (input) {
			const text = input.length > 1 ? editor.sanitizePaste(input) : input;
			if (text) edit(editor.insert(state, text));
		}
	});

	const lines = state.value.split('\n');
	const {line: cursorLine, col: cursorCol} = editor.position(state);
	const borderColor = mode === 'plan' ? colors.accent : state.value ? colors.borderActive : colors.border;
	const placeholder = busy ? `Waiting for response${symbols.ellipsis}` : width >= 60 ? 'Ask TOOLCODE anything, or type / for commands' : `Ask anything${symbols.ellipsis}`;

	return (
		<Box flexDirection="column">
			<Box borderStyle={borderStyle} borderColor={borderColor} paddingX={1} width={width} flexDirection="column">
				{lines.map((text, i) => (
					<Box key={i}>
						<Box width={2} flexShrink={0}>
							<Text color={busy ? colors.muted : colors.primary} bold>
								{i === 0 ? symbols.prompt : ' '}
							</Text>
						</Box>
						<Box flexShrink={1}>
							{state.value === '' ? (
								<Text>
									<Text inverse> </Text>
									<Text color={colors.muted}>{placeholder}</Text>
								</Text>
							) : i === cursorLine ? (
								<Text>
									{text.slice(0, cursorCol)}
									<Text inverse>{text[cursorCol] ?? ' '}</Text>
									{text.slice(cursorCol + 1)}
								</Text>
							) : (
								<Text>{text || ' '}</Text>
							)}
						</Box>
					</Box>
				))}
			</Box>
			{menuOpen && <CommandMenu items={suggestions} selected={selected} width={width} />}
			{state.value === '?' && <ShortcutsPanel width={width} />}
		</Box>
	);
}
