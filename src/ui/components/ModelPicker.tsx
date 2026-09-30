import {useState} from 'react';
import {Box, Text} from 'ink';
import {useKeys} from '../hooks/useKeys.js';
import {keySource} from '../../providers/registry.js';
import type {ModelInfo, Provider} from '../../providers/types.js';
import {windowStart} from '../layout.js';
import {useTheme} from '../theme.js';
import {ListRow} from './ListRow.js';
import {Modal} from './Modal.js';

interface Props {
	/** All providers, built-in and from plugins; their models are listed together. */
	providers: Provider[];
	currentProvider: string;
	current: string;
	width: number;
	/** Tallest the popup may be. */
	maxHeight: number;
	onSelect: (provider: Provider, model: ModelInfo) => void;
	onCancel: () => void;
}

type Row = {kind: 'provider'; provider: Provider} | {kind: 'model'; provider: Provider; model: ModelInfo; index: number};

export function ModelPicker({providers, currentProvider, current, width, maxHeight, onSelect, onCancel}: Props) {
	const {colors, symbols} = useTheme();
	const entries = providers.flatMap(provider => provider.models.map(model => ({provider, model})));
	const isCurrent = (e: {provider: Provider; model: ModelInfo}) => e.provider.id === currentProvider && e.model.id === current;
	const [index, setIndex] = useState(Math.max(0, entries.findIndex(isCurrent)));
	const quickPick = Math.min(entries.length, 9);

	const rows: Row[] = [];
	let count = 0;
	for (const provider of providers) {
		if (provider.models.length === 0) continue;
		rows.push({kind: 'provider', provider});
		for (const model of provider.models) rows.push({kind: 'model', provider, model, index: count++});
	}
	const selectedRow = rows.findIndex(r => r.kind === 'model' && r.index === index);
	const visible = Math.max(1, Math.min(rows.length, maxHeight - 2));
	// Keep the provider heading in view with the first model under it.
	const start = windowStart(rows.length, visible, Math.max(0, selectedRow - (rows[selectedRow - 1]?.kind === 'provider' ? 1 : 0)));
	const labelWidth = Math.max(...entries.map(e => e.model.label.length)) + 2;
	const showIds = width - 4 >= labelWidth + 34;

	useKeys((input, key) => {
		if (key.upArrow || input === 'k') setIndex(i => (i - 1 + entries.length) % entries.length);
		if (key.downArrow || input === 'j') setIndex(i => (i + 1) % entries.length);
		const pick = (i: number) => onSelect(entries[i]!.provider, entries[i]!.model);
		if (key.return) pick(index);
		if (key.escape || (key.ctrl && input === 'c')) onCancel();
		const digit = Number.parseInt(input, 10);
		if (digit >= 1 && digit <= quickPick) pick(digit - 1);
	});

	return (
		<Modal
			title="Models"
			width={width}
			status={
				<Text color={colors.muted}>
					{index + 1} of {entries.length}
				</Text>
			}
			footer={
				<Text color={colors.muted}>
					{symbols.arrowUpDown} move {symbols.dot} {symbols.keyEnter} select {symbols.dot} 1-{quickPick} pick {symbols.dot} esc close
				</Text>
			}
		>
			{rows.slice(start, start + visible).map(row => {
				if (row.kind === 'provider') {
					const source = keySource(row.provider);
					return (
						<Box key={`p:${row.provider.id}`}>
							<Box flexGrow={1} flexShrink={1}>
								<Text bold color={colors.accent} wrap="truncate-end">
									{row.provider.name}
								</Text>
							</Box>
							<Box flexShrink={0} marginLeft={1}>
								{source === 'none' ? (
									<Text color={colors.warning}>
										{symbols.warning} {row.provider.apiKeyEnv} not set
									</Text>
								) : (
									<Text color={source === 'not-needed' ? colors.muted : colors.success}>
										{source === 'not-needed' ? 'no key needed' : `${symbols.bullet} key set`}
									</Text>
								)}
							</Box>
						</Box>
					);
				}
				const active = row.index === index;
				const text = active ? colors.selectionText : undefined;
				return (
					<ListRow key={`m:${row.provider.id}:${row.model.id}`} selected={active}>
						<Box width={4} flexShrink={0}>
							<Text color={active ? colors.selectionText : colors.muted}>{row.index < quickPick ? ` ${row.index + 1}.` : ''}</Text>
						</Box>
						<Box width={showIds ? labelWidth : undefined} flexShrink={showIds ? 0 : 1}>
							<Text color={text} bold={active} wrap="truncate-end">
								{row.model.label}
							</Text>
						</Box>
						{showIds && (
							<Box flexGrow={1} flexShrink={1}>
								<Text color={active ? colors.selectionText : colors.muted} wrap="truncate-end">
									{row.model.id}
								</Text>
							</Box>
						)}
						{isCurrent(row) && (
							<Box flexShrink={0} marginLeft={1}>
								<Text color={colors.success}>{symbols.check}</Text>
							</Box>
						)}
					</ListRow>
				);
			})}
		</Modal>
	);
}
