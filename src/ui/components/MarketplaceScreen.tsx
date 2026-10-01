import {useEffect, useMemo, useState} from 'react';
import {Box, Text} from 'ink';
import {useKeys} from '../hooks/useKeys.js';
import type {CatalogEntry, CatalogState} from '../../plugins/marketplace.js';
import {windowStart} from '../layout.js';
import {isMouseInput} from '../mouse.js';
import {useTheme} from '../theme.js';
import {ListRow} from './ListRow.js';
import {Modal} from './Modal.js';
import {SpinnerIcon} from './Spinner.js';

type Category = CatalogEntry['category'] | 'all';

const FILTERS: Category[] = ['all', 'tool', 'provider', 'command'];

/** Row label and the key hint for it, per catalog state. */
const STATE_VIEW: Record<CatalogState, {row: string; hint: string}> = {
	available: {row: 'install', hint: 'install'},
	installed: {row: 'installed', hint: 'uninstall'},
	loaded: {row: 'loaded', hint: 'already loaded'},
};

interface Props {
	entries: CatalogEntry[];
	/** Whether an entry is installable, installed, or loaded from outside the plugins folder. */
	state: (entry: CatalogEntry) => CatalogState;
	width: number;
	/** Tallest the popup may be. */
	maxHeight: number;
	/** Installs or uninstalls; resolves with a status line to show. */
	onToggle: (entry: CatalogEntry) => Promise<string>;
	onClose: () => void;
}

// Rows around the list: borders, header, tagline, tabs, divider and status line. The
// detail pane below the list is counted separately, since it grows with the description.
const CHROME_ROWS = 10;
// Columns the panel's own borders and padding take off the popup width.
const INNER_COLUMNS = 4;

/** Lines `text` takes at `width`, so the detail pane is never cut mid-sentence. */
function wrappedLines(text: string, width: number): number {
	const limit = Math.max(1, width);
	let lines = 1;
	let used = 0;
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (word.length > limit) {
			// A single long word breaks again at the edge.
			lines += Math.ceil(word.length / limit);
			used = word.length % limit;
		} else if (used + 1 + word.length > limit && used > 0) {
			lines++;
			used = word.length;
		} else {
			used += (used === 0 ? 0 : 1) + word.length;
		}
	}
	return lines;
}

/** /marketplace: the bundled plugin catalog in a large popup over the layout. */
export function MarketplaceScreen({entries, state, width, maxHeight, onToggle, onClose}: Props) {
	const {colors, symbols} = useTheme();
	const [filter, setFilter] = useState<Category>('all');
	const [index, setIndex] = useState(0);
	const [working, setWorking] = useState<string | null>(null);
	const [status, setStatus] = useState<{text: string; ok: boolean} | null>(null);

	const visible = useMemo(() => (filter === 'all' ? entries : entries.filter(e => e.category === filter)), [entries, filter]);
	const counts = useMemo(() => {
		const by = {all: entries.length, tool: 0, provider: 0, command: 0} as Record<Category, number>;
		for (const entry of entries) by[entry.category]++;
		return by;
	}, [entries]);

	// Switching category changes the list, so start again at the top.
	useEffect(() => setIndex(0), [filter]);

	const selected = visible[index];
	const selectedState = selected ? state(selected) : 'available';
	const installedCount = entries.filter(e => state(e) === 'installed').length;
	// One line for the detail title, then the description; the list takes what is left.
	const detailRows = 1 + (selected ? wrappedLines(selected.description, width - INNER_COLUMNS) : 0);
	const listRows = Math.max(1, Math.min(visible.length, maxHeight - CHROME_ROWS - detailRows));
	const height = Math.min(maxHeight, CHROME_ROWS + detailRows + listRows);
	const start = windowStart(visible.length, listRows, index);

	const categoryIcons: Record<CatalogEntry['category'], string> = {
		tool: symbols.iconTool,
		provider: symbols.iconProvider,
		command: symbols.iconCommand,
	};

	const toggle = (entry: CatalogEntry) => {
		setWorking(state(entry) === 'installed' ? `Uninstalling ${entry.name}` : `Installing ${entry.name}`);
		setStatus(null);
		onToggle(entry)
			.then(text => setStatus({text, ok: true}))
			.catch(error => setStatus({text: error instanceof Error ? error.message : String(error), ok: false}))
			.finally(() => setWorking(null));
	};

	useKeys((input, key) => {
		// Closing outranks everything, including a toggle that never settles: a plugin whose
		// import hangs must not leave the user stuck in this popup with no way out.
		if (key.escape || (key.ctrl && input === 'c')) return onClose();
		if (working || isMouseInput(input)) return;
		if (key.rightArrow || key.tab) {
			return setFilter(f => FILTERS[(FILTERS.indexOf(f) + 1) % FILTERS.length]!);
		}
		if (key.leftArrow) {
			return setFilter(f => FILTERS[(FILTERS.indexOf(f) + FILTERS.length - 1) % FILTERS.length]!);
		}
		const jump = Number(input);
		if (jump >= 1 && jump <= FILTERS.length) return setFilter(FILTERS[jump - 1]!);
		if (!visible.length) return;
		if (key.upArrow || input === 'k') return setIndex(i => (i - 1 + visible.length) % visible.length);
		if (key.downArrow || input === 'j') return setIndex(i => (i + 1) % visible.length);
		if (key.return || input === ' ') {
			if (selected) toggle(selected);
		}
	});

	return (
		<Modal
			title="Marketplace"
			width={width}
			height={height}
			color={colors.accent}
			status={
				<Text color={colors.muted}>
					{entries.length} plugins {symbols.dot} {installedCount} installed
				</Text>
			}
			footer={
				<Text color={colors.muted}>
					{symbols.arrowUpDown} move {symbols.dot} {symbols.keyTab} filter {symbols.dot} {symbols.keyEnter}{' '}
					{STATE_VIEW[selectedState].hint} {symbols.dot} esc back
				</Text>
			}
		>
			<Box>
				<Text color={colors.accent}>{symbols.marketplace} </Text>
				<Text bold color={colors.accent}>
					MARKETPLACE
				</Text>
			</Box>
			<Text color={colors.muted} wrap="truncate-end">
				Browse, install and remove plugins without leaving the terminal.
			</Text>

			<Box marginTop={1}>
				{FILTERS.map(f => {
					const active = f === filter;
					return (
						<Box key={f} marginRight={1} backgroundColor={active ? colors.selection : undefined}>
							<Text color={active ? colors.selectionText : colors.muted} bold={active}>
								{active ? <Text color={colors.accent}> {symbols.pointer} </Text> : '   '}
								{f} {counts[f]}{' '}
							</Text>
						</Box>
					);
				})}
			</Box>

			<Box flexDirection="column" marginTop={1} height={listRows} overflow="hidden">
				{visible.length === 0 && <Text color={colors.muted}>Nothing in this category yet.</Text>}
				{visible.slice(start, start + listRows).map((entry, i) => {
					const active = start + i === index;
					const entryState = state(entry);
					const on = entryState !== 'available';
					return (
						<ListRow key={entry.id} selected={active}>
							<Box width={1} flexShrink={0}>
								<Text color={colors.accent}>{active ? symbols.rowMark : ' '}</Text>
							</Box>
							<Box width={2} flexShrink={0}>
								<Text color={active ? colors.accent : colors.muted}>{categoryIcons[entry.category]}</Text>
							</Box>
							<Box flexGrow={1} flexShrink={1} marginRight={2}>
								<Text bold={active} color={active ? colors.selectionText : undefined} wrap="truncate-end">
									{entry.name}
								</Text>
							</Box>
							<Box flexShrink={0} width={12}>
								<Text color={on ? colors.success : active ? colors.selectionText : colors.muted}>
									{on ? `${symbols.check} ${STATE_VIEW[entryState].row}` : `${symbols.dot} ${STATE_VIEW[entryState].row}`}
								</Text>
							</Box>
						</ListRow>
					);
				})}
			</Box>

			<Box height={1} overflow="hidden" marginTop={1}>
				<Text color={colors.border}>{symbols.box.horizontal.repeat(Math.max(0, width - 4))}</Text>
			</Box>
			<Box flexDirection="column" height={detailRows} overflow="hidden">
				{selected && (
					<>
						<Text wrap="truncate-end">
							<Text color={colors.accent}>{categoryIcons[selected.category]} </Text>
							<Text bold>{selected.name}</Text>
							<Text color={colors.muted}>
								{' '}
								{symbols.dot} {selected.category} {symbols.dot} {STATE_VIEW[selectedState].row}
							</Text>
						</Text>
						<Text color={colors.muted} wrap="wrap">
							{selected.description}
						</Text>
					</>
				)}
			</Box>

			<Box height={1}>
				{working ? (
					<Text color={colors.accent}>
						<SpinnerIcon color={colors.accent} /> {working}
						{symbols.ellipsis}
					</Text>
				) : (
					status && (
						<Text color={status.ok ? colors.success : colors.error} wrap="truncate-end">
							{status.ok ? symbols.check : symbols.cross} {status.text}
						</Text>
					)
				)}
			</Box>
		</Modal>
	);
}
