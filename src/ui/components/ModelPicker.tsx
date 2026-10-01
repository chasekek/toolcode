import {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {useKeys} from '../hooks/useKeys.js';
import {keySource} from '../../providers/registry.js';
import type {ModelInfo, Provider} from '../../providers/types.js';
import {windowStart} from '../layout.js';
import {isFree, MODEL_SORTS, selectModels, sortLabel, type ModelSort} from '../models.js';
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

// Rows around the list: search line, sort line, gap, column heads, borders.
const CHROME_ROWS = 7;
// Active-model check, quick-pick digit, and a space before the label.
const GUTTER = 5;

export function ModelPicker({providers, currentProvider, current, width, maxHeight, onSelect, onCancel}: Props) {
	const {colors, symbols} = useTheme();
	// Search is a mode rather than always-on typing, so plain letters keep moving the
	// cursor and digits keep quick-picking a model.
	const [searching, setSearching] = useState(false);
	const [query, setQuery] = useState('');
	const [sort, setSort] = useState<ModelSort>('provider');
	const [freeOnly, setFreeOnly] = useState(false);

	const entries = selectModels(providers, {query, sort, freeOnly});
	// Counted without the filter, so the status can say "3 of 240" rather than just "3".
	const total = selectModels(providers, {query: '', sort, freeOnly: false}).length;
	const isCurrent = (e: {provider: Provider; model: ModelInfo}) => e.provider.id === currentProvider && e.model.id === current;
	// Open on whatever is already selected, so the picker confirms the status quo.
	const [index, setIndex] = useState(0);
	const [opened, setOpened] = useState(false);
	const quickPick = Math.min(entries.length, 9);

	// Jump to the active model once, on the first unfiltered render.
	useEffect(() => {
		if (opened) return;
		const at = entries.findIndex(isCurrent);
		if (at !== -1) setIndex(at);
		setOpened(true);
	}, [entries, opened]);

	// Any change to the result set invalidates the old cursor position.
	useEffect(() => setIndex(0), [query, sort, freeOnly]);

	const listRows = Math.max(1, maxHeight - CHROME_ROWS);
	const start = windowStart(entries.length, listRows, index);
	const freeTagWidth = entries.some(e => isFree(e.model)) ? 7 : 0;
	const labelWidth = Math.max(...entries.map(e => e.model.label.length), 8) + 2;
	const providerWidth = Math.max(...entries.map(e => e.provider.name.length), 6) + 2;
	// Room for the id only when label, provider and a couple of tags all fit. The provider
	// tag is the point of the change, so it holds its column even when the id is dropped.
	const showIds = width - 4 >= GUTTER + labelWidth + freeTagWidth + providerWidth + 34;

	const move = (delta: number) => {
		if (entries.length === 0) return;
		setIndex(i => (i + delta + entries.length) % entries.length);
	};
	const pick = (i: number) => {
		const entry = entries[i];
		if (entry) onSelect(entry.provider, entry.model);
	};

	useKeys((input, key) => {
		if (key.escape || (key.ctrl && input === 'c')) {
			// Esc backs out of search before it closes the popup.
			if (searching || query) {
				setSearching(false);
				setQuery('');
				return;
			}
			return onCancel();
		}

		if (searching) {
			if (key.return) return pick(index);
			if (key.backspace || key.delete) return setQuery(q => q.slice(0, -1));
			// A lone printable character is the query; ctrl/alt combos are not.
			if (input && !key.ctrl && !key.meta && input.length === 1) return setQuery(q => q + input);
			return;
		}

		if (input === '/') {
			setSearching(true);
			return;
		}
		if (input === 's') {
			return setSort(s => MODEL_SORTS[(MODEL_SORTS.indexOf(s) + 1) % MODEL_SORTS.length]!);
		}
		if (input === 'f') {
			setFreeOnly(f => !f);
			return;
		}
		if (key.upArrow || input === 'k') return move(-1);
		if (key.downArrow || input === 'j') return move(1);
		if (key.return) return pick(index);
		const digit = Number.parseInt(input, 10);
		if (digit >= 1 && digit <= quickPick) pick(digit - 1);
	});

	const freeCount = providers.reduce((n, p) => n + p.models.filter(isFree).length, 0);

	return (
		<Modal
			title="Models"
			width={width}
			status={
				<Text color={colors.muted}>
					{entries.length === total ? `${entries.length} models` : `${entries.length} of ${total}`}
				</Text>
			}
			footer={
				<Text color={colors.muted}>
					{symbols.arrowUpDown} move {symbols.dot} / search {symbols.dot} s sort {symbols.dot} f free {symbols.dot}{' '}
					{symbols.keyEnter} select {symbols.dot} esc close
				</Text>
			}
		>
			<Box>
				<Text color={searching ? colors.accent : colors.muted}>{symbols.pointer} </Text>
				<Box flexGrow={1} flexShrink={1}>
					{query ? (
						<Text wrap="truncate-end">
							<Text color={colors.primary}>{query}</Text>
							{searching && <Text color={colors.accent}>▏</Text>}
						</Text>
					) : (
						<Text color={colors.muted}>{searching ? 'type to search…' : '/ to search'}</Text>
					)}
				</Box>
			</Box>

			<Box>
				<Text color={colors.muted}>sort </Text>
				<Text color={colors.primary}>{sortLabel(sort)}</Text>
				<Text color={colors.muted}>{symbols.dot} </Text>
				<Text color={freeOnly ? colors.success : colors.muted}>
					{freeOnly ? `${symbols.check} free only (${freeCount})` : `all models${freeCount > 0 ? ` (${freeCount} free)` : ''}`}
				</Text>
			</Box>

			{/* Column heads share the row widths below, so each label sits over its column. */}
			<Box marginTop={1}>
				<Box width={GUTTER} flexShrink={0} />
				<Box width={showIds ? labelWidth : undefined} flexShrink={showIds ? 0 : 1}>
					<Text color={colors.muted}>MODEL</Text>
				</Box>
				<Box width={freeTagWidth} flexShrink={0} />
				<Box width={providerWidth} flexShrink={0} marginLeft={1}>
					<Text color={colors.muted}>PROVIDER</Text>
				</Box>
				{showIds && <Text color={colors.muted}>ID</Text>}
			</Box>

			<Box flexDirection="column" height={listRows} overflow="hidden">
				{entries.length === 0 && (
					<Text color={colors.muted} wrap="truncate-end">
						{freeOnly && freeCount === 0
							? 'No free models in this catalog.'
							: `Nothing matches “${query}”.`}
					</Text>
				)}
				{entries.slice(start, start + listRows).map((entry, i) => {
					const at = start + i;
					const active = at === index;
					const on = isCurrent(entry);
					const text = active ? colors.selectionText : undefined;
					const source = keySource(entry.provider);
					return (
						<ListRow key={`${entry.provider.id}:${entry.model.id}`} selected={active}>
							{/* The check sits in the gutter, where it can't be truncated away. */}
							<Box width={GUTTER} flexShrink={0}>
								<Text color={active ? colors.selectionText : on ? colors.success : colors.muted}>
									{on ? symbols.check : ' '} {at < quickPick ? at + 1 : ' '}
								</Text>
							</Box>
							<Box width={showIds ? labelWidth : undefined} flexShrink={showIds ? 0 : 1}>
								<Text color={text} bold={active} wrap="truncate-end">
									{entry.model.label}
								</Text>
							</Box>
							{/* A fixed-width slot keeps the provider column aligned whether or not a
							    given row is free, so the names below each other. */}
							<Box width={freeTagWidth} flexShrink={0}>
								{isFree(entry.model) && (
									<Text color={active ? colors.selectionText : colors.success}>(free)</Text>
								)}
							</Box>
							{/* Which provider serves the model, right on the row. The margin keeps a
							    gap even when the id column is dropped and the label box has shrunk. */}
							<Box width={providerWidth} flexShrink={0} marginLeft={1}>
								<Text color={active ? colors.selectionText : colors.muted} wrap="truncate-end">
									{entry.provider.name}
								</Text>
							</Box>
							{showIds && (
								<Box flexGrow={1} flexShrink={1}>
									<Text color={active ? colors.selectionText : colors.muted} wrap="truncate-end">
										{entry.model.id}
									</Text>
								</Box>
							)}
							{source === 'none' && (
								<Box flexShrink={0} marginLeft={1}>
									<Text color={colors.warning} wrap="truncate-end">
										{symbols.warning} no key
									</Text>
								</Box>
							)}
						</ListRow>
					);
				})}
			</Box>
		</Modal>
	);
}
