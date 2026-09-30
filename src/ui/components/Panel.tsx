import type {ReactNode} from 'react';
import {Box, Text} from 'ink';
import {useTheme} from '../theme.js';

export interface ScrollState {
	/** Rows of content above the visible part. */
	offset: number;
	total: number;
	visible: number;
}

interface Props {
	title: string;
	/** Drawn as "[n]" before the title: the key that focuses the panel. */
	index?: number;
	focused?: boolean;
	/** Overrides the border color, e.g. for plan mode. */
	color?: string;
	width: number;
	/** Outer height including borders; omit to fit the content. */
	height?: number;
	/** Right end of the top border. */
	status?: ReactNode;
	/** Right end of the bottom border, e.g. "3 of 12". */
	footer?: ReactNode;
	/** Draws a thumb over the right border when the content is taller than the panel. */
	scroll?: ScrollState;
	/** Where content sits when it is shorter than the panel. */
	justify?: 'flex-start' | 'flex-end' | 'center';
	paddingX?: number;
	children?: ReactNode;
}

/** Fills the rest of a border row with the horizontal line, however wide it is. */
function Rule({color}: {color: string}) {
	const {symbols} = useTheme();
	return (
		<Box flexGrow={1} flexShrink={1} flexBasis={0} height={1} overflow="hidden">
			<Text color={color}>{symbols.box.horizontal.repeat(256)}</Text>
		</Box>
	);
}

/** Where the scroll thumb sits on a track of `track` rows. */
export function thumbFor({offset, total, visible}: ScrollState, track: number): {start: number; size: number} | null {
	if (total <= visible || track <= 0) return null;
	const size = Math.max(1, Math.round((visible / total) * track));
	const room = track - size;
	const start = Math.round((Math.min(offset, total - visible) / (total - visible)) * room);
	return {start, size};
}

/**
 * A bordered panel in the style of lazygit: the title sits inside the top
 * border, a count or status inside the bottom one, and the right border
 * doubles as the scrollbar.
 */
export function Panel({title, index, focused = false, color, width, height, status, footer, scroll, justify = 'flex-start', paddingX = 1, children}: Props) {
	const {colors, symbols, borderStyle} = useTheme();
	const {box} = symbols;
	const borderColor = color ?? (focused ? colors.borderActive : colors.border);
	const titleColor = color ?? (focused ? colors.borderActive : colors.muted);
	const bodyHeight = height === undefined ? undefined : Math.max(0, height - 2);
	const thumb = scroll && bodyHeight ? thumbFor(scroll, bodyHeight) : null;

	return (
		<Box flexDirection="column" width={width} height={height} flexShrink={0}>
			<Box width={width} height={1}>
				<Text color={borderColor}>
					{box.topLeft}
					{box.horizontal}
				</Text>
				<Box flexShrink={1}>
					<Text color={titleColor} bold={focused} wrap="truncate-end">
						{index !== undefined && `[${index}]`}
						{index !== undefined && <Text color={borderColor}>{box.horizontal}</Text>}
						{title}
					</Text>
				</Box>
				<Rule color={borderColor} />
				{status !== undefined && status !== null && status !== false && (
					<Box flexShrink={1}>
						<Text wrap="truncate-end">
							<Text> </Text>
							{status}
							<Text> </Text>
						</Text>
					</Box>
				)}
				<Text color={borderColor}>
					{status !== undefined && status !== null && status !== false && box.horizontal}
					{box.topRight}
				</Text>
			</Box>
			<Box
				// Ink re-applies only changed styles, so a new borderStyle would bring back the
				// top and bottom borders turned off here; remount the body instead.
				key={borderStyle}
				height={bodyHeight}
				flexDirection="column"
				borderStyle={borderStyle}
				borderTop={false}
				borderBottom={false}
				borderColor={borderColor}
				paddingX={paddingX}
				justifyContent={justify}
				overflow="hidden"
			>
				{children}
			</Box>
			<Box width={width} height={1}>
				<Text color={borderColor}>{box.bottomLeft}</Text>
				<Rule color={borderColor} />
				{footer !== undefined && footer !== null && footer !== false && (
					<Box flexShrink={1}>
						<Text wrap="truncate-end">
							<Text> </Text>
							{footer}
							<Text> </Text>
						</Text>
					</Box>
				)}
				<Text color={borderColor}>
					{footer !== undefined && footer !== null && footer !== false && box.horizontal}
					{box.bottomRight}
				</Text>
			</Box>
			{thumb && (
				<Box position="absolute" marginTop={1 + thumb.start} marginLeft={width - 1} width={1} height={thumb.size}>
					<Text color={focused ? colors.borderActive : colors.muted}>{Array(thumb.size).fill(symbols.scrollThumb).join('\n')}</Text>
				</Box>
			)}
		</Box>
	);
}
