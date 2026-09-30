import type {ReactNode} from 'react';
import {Box, Text} from 'ink';
import type {Mode} from '../../core/types.js';
import type {KeySource} from '../../providers/registry.js';
import {APP_NAME, VERSION} from '../../version.js';
import {truncateMiddle} from '../text.js';
import {useTheme} from '../theme.js';
import {Panel} from './Panel.js';
import {GradientText} from './Welcome.js';

interface Props {
	width: number;
	height: number;
	focused: boolean;
	compact: boolean;
	cwd: string;
	providerName: string;
	modelLabel: string;
	keySource: KeySource;
	mode: Mode;
}

const LABEL_WIDTH = 7;

function Field({label, children}: {label: string; children: ReactNode}) {
	const {colors} = useTheme();
	return (
		<Box>
			<Box width={LABEL_WIDTH} flexShrink={0}>
				<Text color={colors.muted}>{label}</Text>
			</Box>
			<Box flexShrink={1}>{children}</Box>
		</Box>
	);
}

/** [1] Who is answering and how: brand, directory, model, provider, key and mode. */
export function SessionPanel({width, height, focused, compact, cwd, providerName, modelLabel, keySource, mode}: Props) {
	const {colors, symbols} = useTheme();
	const inner = Math.max(0, width - 4);
	const key = {
		env: {text: 'from env', color: colors.success, icon: symbols.bullet},
		saved: {text: 'saved', color: colors.success, icon: symbols.bullet},
		none: {text: 'missing', color: colors.warning, icon: symbols.warning},
		'not-needed': {text: 'not needed', color: colors.muted, icon: symbols.toggleOff},
	}[keySource];

	return (
		<Panel title="Session" index={1} focused={focused} width={width} height={height}>
			<Box justifyContent="space-between">
				<GradientText text={`${symbols.brand} ${APP_NAME}`} bold />
				<Text color={colors.muted}>v{VERSION}</Text>
			</Box>
			{compact ? (
				<Text wrap="truncate-end">
					<Text color={colors.primary}>{modelLabel}</Text>
					<Text color={key.color}> {key.icon}</Text>
				</Text>
			) : (
				<>
					<Text color={colors.muted}>{truncateMiddle(cwd, inner, symbols.ellipsis)}</Text>
					<Field label="Model">
						<Text color={colors.primary} wrap="truncate-end">
							{modelLabel}
						</Text>
					</Field>
					<Field label="Via">
						<Text wrap="truncate-end">{providerName}</Text>
					</Field>
					<Field label="Key">
						<Text color={key.color} wrap="truncate-end">
							{key.icon} {key.text}
						</Text>
					</Field>
					<Field label="Mode">
						{mode === 'plan' ? (
							<Text color={colors.accent} bold>
								{symbols.brand} plan
							</Text>
						) : (
							<Text color={colors.muted}>default</Text>
						)}
					</Field>
				</>
			)}
		</Panel>
	);
}
