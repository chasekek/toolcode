import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {ModelInfo, Provider} from '../../providers/types.js';
import {hasApiKey} from '../../providers/registry.js';
import {useTheme} from '../theme.js';

interface Props {
	/** All providers, built-in and from plugins; their models are listed together. */
	providers: Provider[];
	currentProvider: string;
	current: string;
	width: number;
	onSelect: (provider: Provider, model: ModelInfo) => void;
	onCancel: () => void;
}

export function ModelPicker({providers, currentProvider, current, width, onSelect, onCancel}: Props) {
	const {colors, symbols, borderStyle} = useTheme();
	const entries = providers.flatMap(provider => provider.models.map(model => ({provider, model})));
	const isCurrent = (e: (typeof entries)[number]) => e.provider.id === currentProvider && e.model.id === current;
	const [index, setIndex] = useState(Math.max(0, entries.findIndex(isCurrent)));
	const grouped = providers.length > 1;
	const labelWidth = Math.max(...entries.map(e => e.model.label.length)) + 2;
	// Border + padding + cursor + label column need room before the model id fits.
	const showIds = width >= labelWidth + 34;
	const quickPick = Math.min(entries.length, 9);

	useInput((input, key) => {
		if (key.upArrow) setIndex(i => (i - 1 + entries.length) % entries.length);
		if (key.downArrow) setIndex(i => (i + 1) % entries.length);
		const pick = (i: number) => onSelect(entries[i]!.provider, entries[i]!.model);
		if (key.return) pick(index);
		if (key.escape || (key.ctrl && input === 'c')) onCancel();
		const digit = Number.parseInt(input, 10);
		if (digit >= 1 && digit <= quickPick) pick(digit - 1);
	});

	return (
		<Box flexDirection="column" borderStyle={borderStyle} borderColor={colors.accent} paddingX={1} width={width}>
			<Text bold wrap="truncate-end">
				Select a model
				{!grouped && (
					<Text color={colors.muted} bold={false}>
						{' '}
						{symbols.dot} {providers[0]!.name}
					</Text>
				)}
			</Text>
			<Box flexDirection="column" marginY={1}>
				{entries.map((entry, i) => {
					const {provider, model} = entry;
					const selected = i === index;
					const header = grouped && (i === 0 || entries[i - 1]!.provider !== provider);
					return (
						<Box key={`${provider.id}:${model.id}`} flexDirection="column">
							{header && (
								<Text color={colors.muted} bold wrap="truncate-end">
									{provider.name}
									{!hasApiKey(provider) && <Text color={colors.warning} bold={false}> ({provider.apiKeyEnv} not set)</Text>}
								</Text>
							)}
							<Text wrap="truncate-end" color={selected ? colors.accent : undefined} bold={selected}>
								{selected ? `${symbols.pointer} ` : '  '}
								<Text color={colors.muted}>{i < quickPick ? `${i + 1}. ` : '   '}</Text>
								{showIds ? model.label.padEnd(labelWidth) : model.label}
								{showIds && (
									<Text color={colors.muted} bold={false}>
										{model.id}
									</Text>
								)}
								{isCurrent(entry) && <Text color={colors.success}> {symbols.check}</Text>}
							</Text>
						</Box>
					);
				})}
			</Box>
			<Text color={colors.muted} wrap="truncate-end">
				{symbols.arrowUpDown} move {symbols.dot} enter select {symbols.dot} 1-{quickPick} quick pick {symbols.dot} esc cancel
			</Text>
		</Box>
	);
}
