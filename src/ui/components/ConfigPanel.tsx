import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {Settings} from '../../core/types.js';
import type {Provider} from '../../providers/types.js';
import {useTheme} from '../theme.js';

interface Props {
	width: number;
	provider: Provider;
	model: string;
	keySet: boolean;
	settings: Settings;
	onChange: (settings: Settings) => void;
	onOpenModel: () => void;
	onClose: () => void;
}

type Row =
	| {kind: 'info'; label: string; value: string; ok?: boolean}
	| {kind: 'action'; label: string; value: string; run: () => void}
	| {kind: 'toggle'; label: string; key: keyof Settings};

export function ConfigPanel({width, provider, model, keySet, settings, onChange, onOpenModel, onClose}: Props) {
	const {colors, symbols, borderStyle} = useTheme();
	const [index, setIndex] = useState(0);

	const rows: Row[] = [
		{kind: 'info', label: 'Provider', value: provider.name},
		{kind: 'action', label: 'Model', value: model, run: onOpenModel},
		{
			kind: 'info',
			label: 'API key',
			value: !provider.apiKeyEnv ? 'not needed' : `${provider.apiKeyEnv} ${keySet ? 'set' : 'not set'}`,
			ok: keySet,
		},
		{kind: 'toggle', label: 'Unicode symbols', key: 'unicode'},
		{kind: 'toggle', label: 'Expand tool output', key: 'expandTools'},
		{kind: 'toggle', label: 'Simulate errors (demo)', key: 'simulateErrors'},
	];
	const selectable = rows.map((r, i) => (r.kind === 'info' ? -1 : i)).filter(i => i >= 0);
	const current = selectable[index % selectable.length]!;

	useInput((input, key) => {
		if (key.escape || (key.ctrl && input === 'c')) return onClose();
		if (key.upArrow) return setIndex(i => (i - 1 + selectable.length) % selectable.length);
		if (key.downArrow || key.tab) return setIndex(i => (i + 1) % selectable.length);
		if (key.return || input === ' ') {
			const row = rows[current]!;
			if (row.kind === 'action') row.run();
			if (row.kind === 'toggle') onChange({...settings, [row.key]: !settings[row.key]});
		}
	});

	const labelWidth = Math.max(...rows.map(r => r.label.length)) + 3;

	return (
		<Box flexDirection="column" borderStyle={borderStyle} borderColor={colors.accent} paddingX={1} width={width}>
			<Text bold>Settings</Text>
			<Box flexDirection="column" marginY={1}>
				{rows.map((row, i) => {
					const active = i === current;
					let value;
					if (row.kind === 'toggle') {
						const on = settings[row.key];
						value = <Text color={on ? colors.success : colors.muted}>{on ? 'on' : 'off'}</Text>;
					} else if (row.kind === 'info') {
						value = (
							<Text color={row.ok === false ? colors.warning : colors.muted} wrap="truncate-end">
								{row.value}
							</Text>
						);
					} else {
						value = (
							<Text color={colors.primary} wrap="truncate-end">
								{row.value} <Text color={colors.muted}>{symbols.pointer}</Text>
							</Text>
						);
					}
					return (
						<Box key={row.label}>
							<Box width={2} flexShrink={0}>
								<Text color={colors.accent}>{active ? symbols.pointer : ' '}</Text>
							</Box>
							<Box width={labelWidth} flexShrink={1}>
								<Text bold={active} color={row.kind === 'info' ? colors.muted : undefined} wrap="truncate-end">
									{row.label}
								</Text>
							</Box>
							<Box flexShrink={1}>{value}</Box>
						</Box>
					);
				})}
			</Box>
			<Text color={colors.muted} wrap="truncate-end">
				{symbols.arrowUpDown} move {symbols.dot} enter/space change {symbols.dot} esc close
			</Text>
		</Box>
	);
}
