import type {ReactNode} from 'react';
import {Box, Text} from 'ink';
import type {Mode} from '../../core/types.js';
import type {Provider} from '../../providers/types.js';
import {useTheme} from '../theme.js';

interface Props {
	width: number;
	mode: Mode;
	busy: boolean;
	/** Transient message that replaces the left-hand hints, e.g. "press ctrl+c again". */
	notice?: string;
	provider: Provider;
	model: string;
	keySet: boolean;
}

/**
 * Hints on the left keep priority; the model name on the right gives up
 * space first as the terminal narrows.
 */
export function Footer({width, mode, busy, notice, provider, model, keySet}: Props) {
	const {colors, symbols} = useTheme();
	const showProvider = width >= 100;
	const showKeyText = width >= 70;
	const showModel = width >= 50;

	let left: ReactNode;
	if (notice) left = <Text color={colors.warning}>{notice}</Text>;
	else if (mode === 'plan')
		left = (
			<Text color={colors.accent}>
				plan mode on{showKeyText && <Text color={colors.muted}> (shift+tab to toggle)</Text>}
			</Text>
		);
	else if (busy) left = <Text color={colors.muted}>esc to interrupt</Text>;
	else left = <Text color={colors.muted}>? for shortcuts</Text>;

	return (
		<Box paddingX={2} width={width} gap={2}>
			<Box flexShrink={1}>
				<Text wrap="truncate-end">{left}</Text>
			</Box>
			<Box flexGrow={1} flexShrink={4} justifyContent="flex-end">
				{showModel && (
					<Text wrap="truncate-end">
						{showProvider && (
							<Text color={colors.muted}>
								{provider.name} {symbols.dot}{' '}
							</Text>
						)}
						<Text color={colors.primary}>{model}</Text>
					</Text>
				)}
			</Box>
			<Box flexShrink={0}>
				<Text color={keySet ? colors.success : colors.warning}>
					{keySet ? symbols.bullet : symbols.warning}
					{showKeyText && (!provider.apiKeyEnv ? ' no key needed' : keySet ? ' key set' : ' no API key')}
				</Text>
			</Box>
		</Box>
	);
}
