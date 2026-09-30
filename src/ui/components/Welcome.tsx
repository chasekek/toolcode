import {Box, Text} from 'ink';
import {getCommand} from '../../core/commands.js';
import {APP_NAME, AUTHOR, VERSION} from '../../version.js';
import {gradientColors, useTheme} from '../theme.js';

const LOGO = [
	'▀█▀ █▀█ █▀█ █   █▀▀ █▀█ █▀▄ █▀▀',
	' █  █▄█ █▄█ █▄▄ █▄▄ █▄█ █▄▀ ██▄',
];

const ASCII_LOGO = [
	' _____ ___   ___  _     ___ ___  ___  ___ ',
	'|_   _/ _ \\ / _ \\| |   / __/ _ \\|   \\| __|',
	'  | || (_) | (_) | |__| (_| (_) | |) | _| ',
	'  |_| \\___/ \\___/|____|\\___\\___/|___/|___|',
];

/** One line of text colored column by column along the brand gradient. */
export function GradientText({text, bold}: {text: string; bold?: boolean}) {
	const {colors} = useTheme();
	const chars = [...text];
	const palette = gradientColors(colors.gradient, chars.length);
	return (
		<Text bold={bold}>
			{chars.map((char, i) => (
				<Text key={i} color={palette[i]}>
					{char}
				</Text>
			))}
		</Text>
	);
}

interface Props {
	width: number;
	modelLabel: string;
	/** Set when the provider needs a key that isn't configured. */
	missingKey?: {provider: string; env: string};
}

const TIPS: Array<[string, string]> = [
	['/help', 'commands and keybindings'],
	['/model', 'switch model'],
	['/plan', 'plan before touching files'],
	['/auth', 'set API keys'],
	['tab', 'move between panels'],
];

/** Listed only when the plugin is actually installed, so the tips stay true. */
const JUDGE_TIPS: Array<[string, string]> = [
	['/jevjudge', 'check code with the free JEV API'],
	['/jeffjudge', 'check code with a local Jeff model'],
];

/** The empty conversation: logo, version, and a few ways to begin. */
export function Welcome({width, modelLabel, missingKey}: Props) {
	const {colors, symbols, unicode} = useTheme();
	const logo = unicode ? LOGO : ASCII_LOGO;
	const logoWidth = Math.max(...logo.map(l => l.length));
	const showLogo = width >= logoWidth + 2;
	const tips = [...TIPS, ...JUDGE_TIPS.filter(([name]) => getCommand(name))];
	const keyWidth = Math.max(...tips.map(([k]) => k.length)) + 3;

	return (
		<Box flexDirection="column" alignItems="center" flexShrink={0}>
			{showLogo ? (
				logo.map(line => <GradientText key={line} text={line.padEnd(logoWidth)} />)
			) : (
				<GradientText text={`${symbols.brand} ${APP_NAME}`} bold />
			)}
			<Box marginTop={1}>
				<Text color={colors.muted} wrap="truncate-end">
					terminal coding agent {symbols.dot} v{VERSION} {symbols.dot} by <Text color={colors.accent}>{AUTHOR}</Text>
				</Text>
			</Box>
			<Box flexDirection="column" marginTop={1}>
				{tips.map(([key, text]) => (
					<Box key={key}>
						<Box width={keyWidth} flexShrink={0}>
							<Text color={colors.primary}>{key}</Text>
						</Box>
						<Text color={colors.muted} wrap="truncate-end">
							{text}
							{key === '/model' && <Text color={colors.muted}> ({modelLabel})</Text>}
						</Text>
					</Box>
				))}
			</Box>
			{missingKey && (
				<Box marginTop={1}>
					<Text color={colors.warning} wrap="wrap">
						{symbols.warning} No API key for {missingKey.provider}, so replies are a demo {symbols.dot} run <Text bold>/auth</Text>
					</Text>
				</Box>
			)}
		</Box>
	);
}
