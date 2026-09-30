import {Box, Text} from 'ink';
import {shortcuts} from '../commands.js';
import {useTheme} from '../theme.js';

/** Shown under the prompt while the input is exactly "?". Two columns when wide enough. */
export function ShortcutsPanel({width}: {width: number}) {
	const {colors} = useTheme();
	const keyWidth = Math.max(...shortcuts.map(s => s.keys.length)) + 2;
	const columnWidth = keyWidth + 36;
	const columns = width - 4 >= columnWidth * 2 ? 2 : 1;
	const perColumn = Math.ceil(shortcuts.length / columns);

	return (
		<Box paddingX={2}>
			{Array.from({length: columns}, (_, col) => (
				<Box key={col} flexDirection="column" width={columns > 1 ? columnWidth : undefined} flexShrink={1}>
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
	);
}
