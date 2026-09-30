import {Box, Text} from 'ink';
import type {SlashCommand} from '../commands.js';
import {windowStart} from '../layout.js';
import {useTheme} from '../theme.js';
import {ListRow} from './ListRow.js';
import {Modal} from './Modal.js';

export const MAX_MENU_ROWS = 8;

/** Outer height of the menu for `count` matches. */
export function menuHeight(count: number): number {
	return Math.min(count, MAX_MENU_ROWS) + 2;
}

interface Props {
	items: SlashCommand[];
	selected: number;
	width: number;
}

/** Slash-command completions, floating just above the prompt. */
export function CommandMenu({items, selected, width}: Props) {
	const {colors, symbols} = useTheme();
	const rows = Math.min(items.length, MAX_MENU_ROWS);
	const start = windowStart(items.length, rows, selected);
	const nameWidth = Math.max(...items.map(c => `${c.name} ${c.args ?? ''}`.length)) + 2;
	const showDescriptions = width - 4 >= nameWidth + 12;

	return (
		<Modal
			title="Commands"
			width={width}
			footer={
				<Text color={colors.muted}>
					{symbols.keyTab} complete {symbols.dot} {symbols.keyEnter} run {symbols.dot} {selected + 1} of {items.length}
				</Text>
			}
		>
			{items.slice(start, start + rows).map((c, i) => {
				const active = start + i === selected;
				return (
					<ListRow key={c.name} selected={active}>
						<Box width={nameWidth} flexShrink={0}>
							<Text color={active ? colors.selectionText : colors.primary} bold={active}>
								{c.name}
								{c.args && <Text color={active ? colors.selectionText : colors.muted}> {c.args}</Text>}
							</Text>
						</Box>
						{showDescriptions && (
							<Box flexShrink={1}>
								<Text color={active ? colors.selectionText : colors.muted} wrap="truncate-end">
									{c.description}
								</Text>
							</Box>
						)}
					</ListRow>
				);
			})}
		</Modal>
	);
}
