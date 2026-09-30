import {Box, Text} from 'ink';
import {APP_NAME, AUTHOR, VERSION} from '../../version.js';
import {truncateMiddle} from '../hooks/useTerminalWidth.js';
import {useTheme} from '../theme.js';

const LOGO = [
	'▀█▀ █▀█ █▀█ █   █▀▀ █▀█ █▀▄ █▀▀',
	' █  █▄█ █▄█ █▄▄ █▄▄ █▄█ █▄▀ ██▄',
];
const LOGO_WIDTH = LOGO[0]!.length;
// Border (2) + padding (2) around the logo.
const FULL_MIN_WIDTH = LOGO_WIDTH + 4;
const MAX_WIDTH = 72;

interface Props {
	cwd: string;
	width: number;
}

export function Header({cwd, width}: Props) {
	const {colors, symbols, unicode, borderStyle} = useTheme();

	// Too narrow for the boxed logo (or no block glyphs): a compact header.
	if (width < FULL_MIN_WIDTH || !unicode) {
		return (
			<Box flexDirection="column" paddingX={1}>
				<Text wrap="truncate-end">
					<Text color={colors.primary} bold>
						{APP_NAME}
					</Text>
					<Text color={colors.muted}> v{VERSION} {symbols.dot} by </Text>
					<Text color={colors.accent}>{AUTHOR}</Text>
				</Text>
				<Text color={colors.muted}>{truncateMiddle(cwd, Math.max(10, width - 2))}</Text>
			</Box>
		);
	}

	const boxWidth = Math.min(width, MAX_WIDTH);
	const inner = boxWidth - 4;

	return (
		<Box flexDirection="column" borderStyle={borderStyle} borderColor={colors.primary} paddingX={1} width={boxWidth}>
			{LOGO.map(line => (
				<Text key={line} color={colors.primary}>
					{line}
				</Text>
			))}
			<Box justifyContent="space-between" marginTop={1}>
				<Text>
					<Text bold>{APP_NAME}</Text>
					<Text color={colors.muted}> v{VERSION}</Text>
				</Text>
				<Text color={colors.muted}>
					by <Text color={colors.accent}>{AUTHOR}</Text>
				</Text>
			</Box>
			<Text color={colors.muted}>{truncateMiddle(cwd, inner)}</Text>
			<Box marginTop={1}>
				<Text color={colors.muted} wrap="truncate-end">
					<Text color={colors.primary}>/help</Text> commands {symbols.dot} <Text color={colors.primary}>?</Text> shortcuts{' '}
					{symbols.dot} <Text color={colors.primary}>/model</Text> switch model
				</Text>
			</Box>
		</Box>
	);
}
