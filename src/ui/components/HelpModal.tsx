import {useState} from 'react';
import {Box, Text} from 'ink';
import {useKeys} from '../hooks/useKeys.js';
import {APP_NAME, VERSION} from '../../version.js';
import {allCommands, shortcuts} from '../commands.js';
import {useTheme} from '../theme.js';
import {Modal} from './Modal.js';

type Row = {kind: 'heading'; text: string} | {kind: 'item'; left: string; right: string} | {kind: 'gap'};

interface Props {
	width: number;
	/** Tallest the popup may be. */
	maxHeight: number;
	onClose: () => void;
}

/** /help: every command and keybinding, scrollable when the screen is short. */
export function HelpModal({width, maxHeight, onClose}: Props) {
	const {colors, symbols} = useTheme();
	const [offset, setOffset] = useState(0);
	const commands = allCommands();
	const rows: Row[] = [
		{kind: 'heading', text: 'Commands'},
		...commands.map((c): Row => ({kind: 'item', left: `${c.name}${c.args ? ` ${c.args}` : ''}`, right: c.description})),
		{kind: 'gap'},
		{kind: 'heading', text: 'Keybindings'},
		...shortcuts.map((s): Row => ({kind: 'item', left: s.keys, right: s.description})),
	];
	const leftWidth = Math.max(...rows.map(r => (r.kind === 'item' ? r.left.length : 0))) + 3;
	const visible = Math.max(1, Math.min(rows.length, maxHeight - 2));
	const maxOffset = rows.length - visible;

	useKeys((input, key) => {
		if (key.escape || key.return || input === 'q' || (key.ctrl && input === 'c')) return onClose();
		if (key.upArrow || input === 'k') setOffset(o => Math.max(0, o - 1));
		if (key.downArrow || input === 'j') setOffset(o => Math.min(maxOffset, o + 1));
		if (key.pageUp) setOffset(o => Math.max(0, o - visible));
		if (key.pageDown) setOffset(o => Math.min(maxOffset, o + visible));
	});

	return (
		<Modal
			title="Help"
			width={width}
			status={
				<Text color={colors.muted}>
					{APP_NAME} v{VERSION}
				</Text>
			}
			footer={
				<Text color={colors.muted}>
					{maxOffset > 0 ? `${symbols.arrowUpDown} scroll ${symbols.dot} ` : ''}esc close
				</Text>
			}
		>
			{rows.slice(offset, offset + visible).map((row, i) => {
				if (row.kind === 'gap') return <Text key={i}> </Text>;
				if (row.kind === 'heading') {
					return (
						<Text key={i} bold color={colors.accent}>
							{row.text}
						</Text>
					);
				}
				return (
					<Box key={i}>
						<Box width={leftWidth} flexShrink={0}>
							<Text color={colors.primary}>{row.left}</Text>
						</Box>
						<Text color={colors.muted} wrap="truncate-end">
							{row.right}
						</Text>
					</Box>
				);
			})}
		</Modal>
	);
}
