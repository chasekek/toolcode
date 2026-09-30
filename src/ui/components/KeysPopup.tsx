import {Box, Text} from 'ink';
import {shortcuts} from '../commands.js';
import {useTheme} from '../theme.js';
import {Modal} from './Modal.js';

/** Outer height of the popup at `width`. */
export function keysPopupHeight(width: number): number {
	return Math.ceil(shortcuts.length / columnsFor(width)) + 2;
}

const keyWidth = Math.max(...shortcuts.map(s => s.keys.length)) + 2;
const COLUMN = keyWidth + 38;

function columnsFor(width: number): number {
	return width - 4 >= COLUMN * 2 ? 2 : 1;
}

/** Shown above the prompt while the input is exactly "?". */
export function KeysPopup({width}: {width: number}) {
	const {colors} = useTheme();
	const columns = columnsFor(width);
	const perColumn = Math.ceil(shortcuts.length / columns);

	return (
		<Modal title="Keybindings" width={width} footer={<Text color={colors.muted}>/help for commands</Text>}>
			<Box>
				{Array.from({length: columns}, (_, col) => (
					<Box key={col} flexDirection="column" width={columns > 1 ? COLUMN : undefined} flexShrink={1}>
						{shortcuts.slice(col * perColumn, (col + 1) * perColumn).map(s => (
							<Box key={s.keys}>
								<Box width={keyWidth} flexShrink={0}>
									<Text color={colors.primary}>{s.keys}</Text>
								</Box>
								<Text color={colors.muted} wrap="truncate-end">
									{s.description}
								</Text>
							</Box>
						))}
					</Box>
				))}
			</Box>
		</Modal>
	);
}
