import {useState} from 'react';
import {Box, Text} from 'ink';
import {useKeys} from '../hooks/useKeys.js';
import type {Settings} from '../../core/types.js';
import type {Provider} from '../../providers/types.js';
import {useTheme} from '../theme.js';
import {ListRow} from './ListRow.js';
import {Modal} from './Modal.js';

interface Props {
	width: number;
	provider: Provider;
	modelLabel: string;
	keySet: boolean;
	settings: Settings;
	onChange: (settings: Settings) => void;
	onOpenModel: () => void;
	onOpenAuth: () => void;
	onClose: () => void;
}

type Row =
	| {kind: 'info'; label: string; value: string; ok?: boolean}
	| {kind: 'action'; label: string; value: string; ok?: boolean; run: () => void}
	| {kind: 'toggle'; label: string; key: keyof Settings; hint?: string};

export function ConfigPanel({width, provider, modelLabel, keySet, settings, onChange, onOpenModel, onOpenAuth, onClose}: Props) {
	const {colors, symbols} = useTheme();
	const [index, setIndex] = useState(0);

	const rows: Row[] = [
		{kind: 'info', label: 'Provider', value: provider.name},
		{kind: 'action', label: 'Model', value: modelLabel, run: onOpenModel},
		{
			kind: 'action',
			label: 'API key',
			value: !provider.apiKeyEnv ? 'not needed' : keySet ? 'set' : `not set (${provider.apiKeyEnv})`,
			ok: keySet,
			run: onOpenAuth,
		},
		{kind: 'toggle', label: 'Unicode symbols', key: 'unicode'},
		{kind: 'toggle', label: 'Mouse', key: 'mouse', hint: 'wheel and clicks; shift+drag selects'},
		{kind: 'toggle', label: 'Expand tool output', key: 'expandTools'},
		{kind: 'toggle', label: 'Simulate errors (demo)', key: 'simulateErrors'},
	];
	const selectable = rows.map((r, i) => (r.kind === 'info' ? -1 : i)).filter(i => i >= 0);
	const current = selectable[index % selectable.length]!;

	useKeys((input, key) => {
		if (key.escape || (key.ctrl && input === 'c')) return onClose();
		if (key.upArrow || input === 'k') return setIndex(i => (i - 1 + selectable.length) % selectable.length);
		if (key.downArrow || input === 'j' || key.tab) return setIndex(i => (i + 1) % selectable.length);
		if (key.return || input === ' ') {
			const row = rows[current]!;
			if (row.kind === 'action') row.run();
			if (row.kind === 'toggle') onChange({...settings, [row.key]: !settings[row.key]});
		}
	});

	const labelWidth = Math.max(...rows.map(r => r.label.length)) + 3;

	return (
		<Modal
			title="Settings"
			width={width}
			footer={
				<Text color={colors.muted}>
					{symbols.arrowUpDown} move {symbols.dot} {symbols.keyEnter}/space change {symbols.dot} esc close
				</Text>
			}
		>
			{rows.map((row, i) => {
				const active = i === current;
				const muted = active ? colors.selectionText : colors.muted;
				let value;
				if (row.kind === 'toggle') {
					const on = Boolean(settings[row.key]);
					value = (
						<Text wrap="truncate-end">
							<Text color={on ? colors.success : muted}>
								{on ? symbols.toggleOn : symbols.toggleOff} {on ? 'on' : 'off'}
							</Text>
							{row.hint && <Text color={muted}> {row.hint}</Text>}
						</Text>
					);
				} else if (row.kind === 'info') {
					value = (
						<Text color={colors.muted} wrap="truncate-end">
							{row.value}
						</Text>
					);
				} else {
					value = (
						<Text color={active ? colors.selectionText : row.ok === false ? colors.warning : colors.primary} wrap="truncate-end">
							{row.value} <Text color={muted}>{symbols.pointer}</Text>
						</Text>
					);
				}
				return (
					<ListRow key={row.label} selected={active}>
						<Box width={labelWidth} flexShrink={1}>
							<Text bold={active} color={active ? colors.selectionText : row.kind === 'info' ? colors.muted : undefined} wrap="truncate-end">
								{row.label}
							</Text>
						</Box>
						<Box flexShrink={1}>{value}</Box>
					</ListRow>
				);
			})}
		</Modal>
	);
}
