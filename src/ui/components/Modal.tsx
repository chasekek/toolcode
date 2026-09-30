import type {ReactNode} from 'react';
import {Box, Text} from 'ink';
import {useTheme} from '../theme.js';
import {Panel} from './Panel.js';

interface Props {
	title: string;
	width: number;
	/** Outer height; omit to fit the content. */
	height?: number;
	/** Border color; defaults to the focus color, since a popup always has focus. */
	color?: string;
	status?: ReactNode;
	footer?: ReactNode;
	children?: ReactNode;
}

/**
 * Blanks the cells under a popup. Ink draws later siblings over earlier ones
 * but leaves untouched cells alone, so without this the layout behind would
 * show through the gaps.
 */
function Underlay({width, rows}: {width: number; rows: number}) {
	const line = ' '.repeat(Math.max(0, width));
	return (
		<Box position="absolute" width={width} height="100%" overflow="hidden">
			<Text>{Array(rows).fill(line).join('\n')}</Text>
		</Box>
	);
}

/** A popup panel over the layout. Place it inside an <Overlay>. */
export function Modal({title, width, height, color, status, footer, children}: Props) {
	const {colors} = useTheme();
	return (
		<Box flexDirection="column" width={width} height={height} flexShrink={0}>
			<Underlay width={width} rows={height ?? 200} />
			<Panel title={title} width={width} height={height} focused color={color ?? colors.borderActive} status={status} footer={footer}>
				{children}
			</Panel>
		</Box>
	);
}

interface OverlayProps {
	width: number;
	height: number;
	/** Center the popup, or pin it to a spot (cells from the top-left). */
	at?: {x: number; y: number};
	children: ReactNode;
}

/** A full-frame layer for popups, drawn over everything rendered before it. */
export function Overlay({width, height, at, children}: OverlayProps) {
	if (at) {
		return (
			<Box position="absolute" marginLeft={at.x} marginTop={at.y} flexDirection="column">
				{children}
			</Box>
		);
	}
	return (
		<Box position="absolute" width={width} height={height} alignItems="center" justifyContent="center" flexDirection="column">
			{children}
		</Box>
	);
}
