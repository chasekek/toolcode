import {useLayoutEffect, useRef} from 'react';
import {Box, measureElement, Text, type DOMElement} from 'ink';
import type {Message} from '../../core/types.js';
import {useTheme} from '../theme.js';
import {MessageView} from './MessageView.js';

interface Props {
	messages: Message[];
	/** First message rendered; older ones are summarized in one line. */
	start: number;
	/** Rows the panel shows. */
	viewport: number;
	/** Rows scrolled past at the top, or null to stay pinned to the newest output. */
	top: number | null;
	expandTools: boolean;
	/** Reports the rendered height after every layout, for scrolling and the scrollbar. */
	onMeasure: (height: number) => void;
}

/**
 * The transcript inside the main panel. Pinned, it is laid out from the
 * bottom so new output stays in view without measuring first; scrolled, it
 * is offset from the top so streaming output below doesn't move what the
 * reader is looking at.
 */
export function ChatView({messages, start, viewport, top, expandTools, onMeasure}: Props) {
	const {colors, symbols} = useTheme();
	const ref = useRef<DOMElement>(null);

	useLayoutEffect(() => {
		if (ref.current) onMeasure(measureElement(ref.current).height);
	});

	return (
		// At least one screen tall, so a short conversation still starts at the top.
		<Box ref={ref} flexDirection="column" flexShrink={0} minHeight={viewport} marginTop={top === null ? 0 : -top} paddingBottom={1}>
			{start > 0 && (
				<Text color={colors.muted}>
					{symbols.ellipsis} {start} earlier message{start === 1 ? '' : 's'} {symbols.dot} scroll up for more
				</Text>
			)}
			{messages.slice(start).map(message => (
				<MessageView key={message.id} message={message} expandTools={expandTools} />
			))}
		</Box>
	);
}
