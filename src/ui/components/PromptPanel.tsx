import type {ReactNode} from 'react';
import {Box, Text} from 'ink';
import type {Mode} from '../../core/types.js';
import * as editor from '../editor.js';
import {windowStart} from '../layout.js';
import {useTheme} from '../theme.js';
import {Panel} from './Panel.js';

interface Props {
	width: number;
	height: number;
	state: editor.EditorState;
	focused: boolean;
	/** Focus is on another panel (not a popup): say how to get back. */
	away: boolean;
	busy: boolean;
	mode: Mode;
	/** Replaces the placeholder, e.g. while a question popup waits for an answer. */
	hint?: string;
	/** Right end of the top border. */
	status?: ReactNode;
}

/** The input box. Long drafts scroll so the cursor line stays in view. */
export function PromptPanel({width, height, state, focused, away, busy, mode, hint, status}: Props) {
	const {colors, symbols} = useTheme();
	const rows = Math.max(1, height - 2);
	const lines = state.value.split('\n');
	const {line: cursorLine, col: cursorCol} = editor.position(state);
	const start = windowStart(lines.length, rows, cursorLine);
	const color = mode === 'plan' ? colors.accent : undefined;
	const placeholder = hint
		? hint
		: away
			? `Press esc or i to type${symbols.ellipsis}`
			: busy
				? `Waiting for the response${symbols.ellipsis} esc interrupts`
				: width >= 64
					? 'Ask TOOLCODE anything, or type / for commands'
					: `Ask anything${symbols.ellipsis}`;

	return (
		<Panel title={mode === 'plan' ? `Prompt ${symbols.dot} plan mode` : 'Prompt'} focused={focused} color={color} width={width} height={height} status={status}>
			{lines.slice(start, start + rows).map((text, i) => {
				const index = start + i;
				return (
					<Box key={index}>
						<Box width={2} flexShrink={0}>
							<Text color={busy || !focused ? colors.muted : (color ?? colors.primary)} bold>
								{index === 0 ? symbols.prompt : ' '}
							</Text>
						</Box>
						<Box flexShrink={1}>
							{state.value === '' ? (
								<Text wrap="truncate-end">
									{focused && <Text inverse> </Text>}
									<Text color={colors.muted}>{placeholder}</Text>
								</Text>
							) : index === cursorLine && focused ? (
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
				);
			})}
		</Panel>
	);
}
