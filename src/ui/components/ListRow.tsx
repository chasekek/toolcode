import type {ReactNode} from 'react';
import {Box} from 'ink';
import {useTheme} from '../theme.js';

interface Props {
	selected: boolean;
	children: ReactNode;
}

/**
 * A list row; the selected one gets a full-width highlight bar, as in lazygit.
 * Rows stay one line by truncating their text rather than clipping: Ink clips
 * to the innermost overflow box only, so a clipping row inside a scrolled
 * panel would escape the panel's own clip and draw over its border.
 */
export function ListRow({selected, children}: Props) {
	const {colors} = useTheme();
	return (
		<Box flexShrink={0} height={1} backgroundColor={selected ? colors.selection : undefined}>
			{children}
		</Box>
	);
}
