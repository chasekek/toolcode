import {useEffect, useMemo, useState} from 'react';
import {Box, Text} from 'ink';
import {useKeys} from '../hooks/useKeys.js';
import type {CatalogEntry} from '../../plugins/marketplace.js';
import {windowStart} from '../layout.js';
import {useTheme} from '../theme.js';
import {ListRow} from './ListRow.js';
import {Modal} from './Modal.js';
import {useTick} from './Spinner.js';

type Category = CatalogEntry['category'] | 'all';

const FILTERS: Category[] = ['all', 'tool', 'provider', 'command'];

interface Props {
	entries: CatalogEntry[];
	installed: (entry: CatalogEntry) => boolean;
	width: number;
	/** Tallest the popup may be. */
	maxHeight: number;
	/** Installs or uninstalls; resolves with a status line to show. */
	onToggle: (entry: CatalogEntry) => Promise<string>;
	onClose: () => void;
}

// Rows around the list: header, tagline, tabs, gaps, detail pane, status line, borders.
const CHROME_ROWS = 13;

/** /marketplace: the bundled plugin catalog in a large popup over the layout. */
export function MarketplaceScreen({entries, installed, width, maxHeight, onToggle, onClose}: Props) {
	const {colors, symbols} = useTheme();
	const [filter, setFilter] = useState<Category>('all');
	const [index, setIndex] = useState(0);
	const [working, setWorking] = useState<string | null>(null);
	const [status, setStatus] = useState<{text: string; ok: boolean} | null>(null);
	// Slow tick drives the gentle pulse in the header so the screen never sits dead still.
	const tick = useTick(140);

	const visible = useMemo(() => (filter === 'all' ? entries : entries.filter(e => e.category === filter)), [entries, filter]);
	const counts = useMemo(() => {
		const by = {all: entries.length, tool: 0, provider: 0, command: 0} as Record<Category, number>;
		for (const entry of entries) by[entry.category]++;
		return by;
	}, [entries]);

	// Switching category changes the list, so start again at the top.
	useEffect(() => setIndex(0), [filter]);

	const selected = visible[index];
	const installedCount = entries.filter(installed).length;
	const height = Math.max(Math.min(maxHeight, entries.length + CHROME_ROWS), Math.min(maxHeight, CHROME_ROWS + 3));
	const listRows = Math.max(1, height - CHROME_ROWS);
	const start = windowStart(visible.length, listRows, index);

	const categoryIcons: Record<CatalogEntry['category'], string> = {
		tool: symbols.iconTool,
		provider: symbols.iconProvider,
		command: symbols.iconCommand,
	};

	const toggle = (entry: CatalogEntry) => {
		setWorking(installed(entry) ? `Uninstalling ${entry.name}` : `Installing ${entry.name}`);
		setStatus(null);
		onToggle(entry)
			.then(text => setStatus({text, ok: true}))
			.catch(error => setStatus({text: error instanceof Error ? error.message : String(error), ok: false}))
			.finally(() => setWorking(null));
	};

	useKeys((input, key) => {
		if (working) return;
		if (key.escape || (key.ctrl && input === 'c')) return onClose();
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

	// The header mark breathes between filled and hollow, so an idle screen still has motion.
	const mark = tick % 2 === 0 ? symbols.marketplace : symbols.bullet;

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
					{selected && installed(selected) ? 'uninstall' : 'install'} {symbols.dot} esc back
				</Text>
			}
		>
			<Box>
				<Text color={colors.accent}>{mark} </Text>
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
					const isOn = installed(entry);
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
								<Text color={isOn ? colors.success : active ? colors.selectionText : colors.muted}>
									{isOn ? `${symbols.check} installed` : `${symbols.dot} install`}
								</Text>
							</Box>
						</ListRow>
					);
				})}
			</Box>

			<Box height={1} overflow="hidden" marginTop={1}>
				<Text color={colors.border}>{symbols.box.horizontal.repeat(Math.max(0, width - 4))}</Text>
			</Box>
			<Box flexDirection="column" height={3} overflow="hidden">
				{selected && (
					<>
						<Text wrap="truncate-end">
							<Text color={colors.accent}>{categoryIcons[selected.category]} </Text>
							<Text bold>{selected.name}</Text>
							<Text color={colors.muted}>
								{' '}
								{symbols.dot} {selected.category}
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
						{symbols.spinner[tick % symbols.spinner.length]} {working}
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
