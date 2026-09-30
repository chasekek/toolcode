import {useState} from 'react';
import {Box, Text} from 'ink';
import {useKeys} from '../hooks/useKeys.js';
import {useSyncState} from '../hooks/useSyncState.js';
import {getStoredKey} from '../../providers/auth.js';
import {keySource} from '../../providers/registry.js';
import type {Provider} from '../../providers/types.js';
import * as editor from '../editor.js';
import {isMouseInput} from '../mouse.js';
import {useTheme} from '../theme.js';
import {ListRow} from './ListRow.js';
import {Modal} from './Modal.js';

interface Props {
	/** All installed providers; only those with `apiKeyEnv` can be given a key. */
	providers: Provider[];
	/** Opens straight into key entry for this provider. */
	initial?: string;
	width: number;
	onSave: (provider: Provider, key: string) => void;
	onRemove: (provider: Provider) => void;
	onClose: () => void;
}

/**
 * Save or remove API keys for installed providers. Keys are typed here rather
 * than as a command argument so they never land in the input history.
 */
export function AuthPanel({providers, initial, width, onSave, onRemove, onClose}: Props) {
	const {colors, symbols} = useTheme();
	const keyed = providers.filter(p => p.apiKeyEnv);
	const keyless = providers.filter(p => !p.apiKeyEnv);
	const initialIndex = keyed.findIndex(p => p.id === initial);
	const [index, setIndex] = useState(Math.max(0, initialIndex));
	const [typing, setTyping] = useState(initialIndex !== -1);
	const [draft, setDraft, readDraft] = useSyncState(editor.emptyEditor);
	const selected = keyed[index];

	useKeys((input, key) => {
		if (isMouseInput(input)) return;
		if (key.ctrl && input === 'c') return onClose();
		if (typing) {
			const draft = readDraft();
			if (key.escape) {
				setDraft(editor.emptyEditor);
				return setTyping(false);
			}
			if (key.return) {
				const value = draft.value.trim();
				if (value && selected) onSave(selected, value);
				return;
			}
			if (key.leftArrow) return setDraft(editor.moveLeft(draft));
			if (key.rightArrow) return setDraft(editor.moveRight(draft));
			if (key.backspace || key.delete) return setDraft(editor.backspace(draft));
			if (key.ctrl && input === 'u') return setDraft(editor.emptyEditor);
			if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow) return;
			// Pasted keys often carry a trailing newline or stray spaces.
			const text = editor.sanitizePaste(input).replace(/\s/g, '');
			if (text) setDraft(editor.insert(draft, text));
			return;
		}
		if (key.escape) return onClose();
		if (keyed.length === 0) return;
		if (key.upArrow || input === 'k') return setIndex(i => (i - 1 + keyed.length) % keyed.length);
		if (key.downArrow || input === 'j' || key.tab) return setIndex(i => (i + 1) % keyed.length);
		if (key.return) return setTyping(true);
		if (input === 'd' && selected) onRemove(selected);
	});

	const status = (provider: Provider, highlighted: boolean) => {
		const source = keySource(provider);
		const ok = highlighted ? colors.selectionText : colors.success;
		if (source === 'env') {
			const shadowed = getStoredKey(provider.id) ? ', overrides saved key' : '';
			return (
				<Text color={ok}>
					{symbols.check} from {provider.apiKeyEnv}
					{shadowed}
				</Text>
			);
		}
		if (source === 'saved') return <Text color={ok}>{symbols.check} saved</Text>;
		return <Text color={colors.warning}>not set</Text>;
	};
	const nameWidth = Math.max(0, ...keyed.map(p => p.name.length)) + 2;

	return (
		<Modal
			title="API keys"
			width={width}
			footer={
				<Text color={colors.muted}>
					{typing
						? `${symbols.keyEnter} save ${symbols.dot} ctrl+u clear ${symbols.dot} esc back`
						: `${symbols.arrowUpDown} move ${symbols.dot} ${symbols.keyEnter} set key ${symbols.dot} d remove ${symbols.dot} esc close`}
				</Text>
			}
		>
			{keyed.length === 0 && <Text color={colors.muted}>No installed provider needs an API key.</Text>}
			{keyed.map((provider, i) => {
				const active = i === index;
				const highlighted = active && !typing;
				return (
					<ListRow key={provider.id} selected={highlighted}>
						<Box width={2} flexShrink={0}>
							<Text color={highlighted ? colors.selectionText : colors.accent}>{active ? symbols.pointer : ' '}</Text>
						</Box>
						<Box width={nameWidth} flexShrink={0}>
							<Text bold={active} color={highlighted ? colors.selectionText : undefined}>
								{provider.name}
							</Text>
						</Box>
						<Box flexShrink={1}>
							<Text wrap="truncate-end">{status(provider, highlighted)}</Text>
						</Box>
					</ListRow>
				);
			})}
			{typing && selected && (
				<Box flexDirection="column" marginTop={1}>
					<Text wrap="truncate-end">
						Paste the key for <Text bold>{selected.name}</Text>
						<Text color={colors.muted}> (saved to ~/.toolcode/auth.json)</Text>
					</Text>
					<Text wrap="truncate-end">
						<Text color={colors.accent}>{symbols.prompt} </Text>
						{symbols.secret.repeat(draft.cursor)}
						<Text inverse>{draft.cursor < draft.value.length ? symbols.secret : ' '}</Text>
						{symbols.secret.repeat(Math.max(0, draft.value.length - draft.cursor - 1))}
						{!draft.value && <Text color={colors.muted}>API key</Text>}
					</Text>
				</Box>
			)}
			{keyless.length > 0 && (
				<Box marginTop={1}>
					<Text color={colors.muted} wrap="truncate-end">
						No key needed: {keyless.map(p => p.name).join(', ')}
					</Text>
				</Box>
			)}
		</Modal>
	);
}
