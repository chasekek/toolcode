import {Box, Text} from 'ink';
import {useTheme} from '../theme.js';

interface Props {
	done: number;
	total: number;
	width: number;
}

/** A thin bar with the percentage after it. */
export function ProgressBar({done, total, width}: Props) {
	const {colors, symbols} = useTheme();
	const ratio = total === 0 ? 0 : done / total;
	const label = `${Math.round(ratio * 100)}%`;
	const cells = Math.max(0, width - label.length - 1);
	const filled = Math.round(ratio * cells);
	return (
		<Box>
			<Text color={ratio === 1 ? colors.success : colors.accent}>{symbols.progressFull.repeat(filled)}</Text>
			<Text color={colors.border}>{symbols.progressEmpty.repeat(cells - filled)}</Text>
			<Text color={colors.muted}> {label}</Text>
		</Box>
	);
}
