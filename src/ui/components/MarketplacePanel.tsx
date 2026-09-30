import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {CatalogEntry} from '../../plugins/marketplace.js';
import {useTheme} from '../theme.js';

interface Props {
	entries: CatalogEntry[];
	installed: (entry: CatalogEntry) => boolean;
	width: number;
	/** Installs or uninstalls; resolves with a status line to show. */
	onToggle: (entry: CatalogEntry) => Promise<string>;
	onClose: () => void;
}

/** /marketplace: the bundled plugin catalog. Enter installs or uninstalls the selected plugin. */
export function MarketplacePanel({entries, installed, width, onToggle, onClose}: Props) {
	const {colors, symbols, borderStyle} = useTheme();
	const [index, setIndex] = useState(0);
	const [working, setWorking] = useState<string | null>(null);
	const [status, setStatus] = useState<{text: string; ok: boolean} | null>(null);
	const nameWidth = Math.max(...entries.map(e => e.name.length), 4) + 2;
	const categoryWidth = 10;
	const showDescriptions = width >= nameWidth + categoryWidth + 30;

	useInput((input, key) => {
		if (working) return;
		if (key.escape || (key.ctrl && input === 'c')) return onClose();
		if (entries.length === 0) return;
		if (key.upArrow) return setIndex(i => (i - 1 + entries.length) % entries.length);
		if (key.downArrow || key.tab) return setIndex(i => (i + 1) % entries.length);
		if (key.return || input === ' ') {
			const entry = entries[index]!;
			setWorking(installed(entry) ? `Uninstalling ${entry.name}` : `Installing ${entry.name}`);
			setStatus(null);
			onToggle(entry)
				.then(text => setStatus({text, ok: true}))
				.catch(error => setStatus({text: error instanceof Error ? error.message : String(error), ok: false}))
				.finally(() => setWorking(null));
		}
	});

	const selected = entries[index];

	return (
		<Box flexDirection="column" borderStyle={borderStyle} borderColor={colors.accent} paddingX={1} width={width}>
			<Text bold wrap="truncate-end">
				Marketplace{' '}
				<Text color={colors.muted} bold={false}>
					{symbols.dot} {entries.length} plugins
				</Text>
			</Text>
			<Box flexDirection="column" marginY={1}>
				{entries.length === 0 && <Text color={colors.muted}>No plugins in the catalog.</Text>}
				{entries.map((entry, i) => {
					const active = i === index;
					const isOn = installed(entry);
					return (
						<Box key={entry.id}>
							<Box width={2} flexShrink={0}>
								<Text color={colors.accent}>{active ? symbols.pointer : ' '}</Text>
							</Box>
							<Box width={nameWidth} flexShrink={0}>
								<Text bold={active} color={active ? colors.accent : undefined}>
									{entry.name}
								</Text>
							</Box>
							<Box width={categoryWidth} flexShrink={0}>
								<Text color={colors.muted}>{entry.category}</Text>
							</Box>
							<Box width={13} flexShrink={0}>
								{isOn ? <Text color={colors.success}>{symbols.check} installed</Text> : <Text color={colors.primary}>install</Text>}
							</Box>
							{showDescriptions && (
								<Box flexShrink={1}>
									<Text color={colors.muted} wrap="truncate-end">
										{entry.description}
									</Text>
								</Box>
							)}
						</Box>
					);
				})}
			</Box>
			{!showDescriptions && selected && (
				<Text color={colors.muted} wrap="wrap">
					{selected.description}
				</Text>
			)}
			{working ? (
				<Text color={colors.accent}>
					{working}
					{symbols.ellipsis}
				</Text>
			) : (
				status && (
					<Text color={status.ok ? colors.success : colors.error} wrap="wrap">
						{status.ok ? symbols.check : symbols.cross} {status.text}
					</Text>
				)
			)}
			<Text color={colors.muted} wrap="truncate-end">
				{symbols.arrowUpDown} move {symbols.dot} enter {selected && installed(selected) ? 'uninstall' : 'install'} {symbols.dot} esc close
			</Text>
		</Box>
	);
}
