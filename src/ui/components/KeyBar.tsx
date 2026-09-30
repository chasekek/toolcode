import type {ReactNode} from 'react';
import {Box, Text} from 'ink';
import {useTheme} from '../theme.js';

export type Hint = [keys: string, action: string];

interface Props {
	width: number;
	hints: Hint[];
	/** Status on the right: activity, a transient notice, or the mode. */
	right?: ReactNode;
}

/** The bottom line: what the keys do right now, lazygit's options bar. */
export function KeyBar({width, hints, right}: Props) {
	const {colors, symbols} = useTheme();
	return (
		<Box width={width} height={1} paddingX={1}>
			<Box flexShrink={1} flexGrow={1} overflow="hidden">
				<Text wrap="truncate-end">
					{hints.map(([keys, action], i) => (
						<Text key={keys}>
							{i > 0 && <Text color={colors.border}> {symbols.dot} </Text>}
							<Text color={colors.primary}>{keys}</Text>
							<Text color={colors.muted}> {action}</Text>
						</Text>
					))}
				</Text>
			</Box>
			{right && (
				<Box flexShrink={0} marginLeft={2}>
					{right}
				</Box>
			)}
		</Box>
	);
}
