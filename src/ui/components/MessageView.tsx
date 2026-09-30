import {memo, type ReactNode} from 'react';
import {Box, Text} from 'ink';
import type {AssistantMessage, Message, NoticeMessage} from '../../core/types.js';
import {expandTabs} from '../text.js';
import {useTheme} from '../theme.js';
import {Markdown} from './Markdown.js';
import {ToolCallView} from './ToolCallView.js';

/** A marker in a fixed-width gutter so wrapped lines stay aligned with the text. */
function Gutter({children}: {children: ReactNode}) {
	return (
		<Box width={2} flexShrink={0}>
			{children}
		</Box>
	);
}

function ErrorBlock({message}: {message: string}) {
	const {colors, symbols, borderStyle} = useTheme();
	return (
		<Box flexDirection="column" borderStyle={borderStyle} borderColor={colors.error} paddingX={1}>
			<Text color={colors.error} bold>
				{symbols.cross} Request failed
			</Text>
			<Text>{message}</Text>
			<Text color={colors.muted}>
				Type <Text color={colors.primary}>/retry</Text> to try again, or edit your message and resend.
			</Text>
		</Box>
	);
}

function AssistantView({message, expandTools}: {message: AssistantMessage; expandTools: boolean}) {
	const {colors, symbols} = useTheme();
	return (
		<Box flexDirection="column" gap={1}>
			{message.parts.map((part, i) =>
				part.type === 'text' ? (
					<Box key={i}>
						<Gutter>
							<Text color={colors.accent}>{symbols.bullet}</Text>
						</Gutter>
						<Box flexShrink={1} flexGrow={1}>
							<Markdown text={part.text} />
						</Box>
					</Box>
				) : (
					<ToolCallView key={part.call.id} call={part.call} expanded={expandTools} />
				),
			)}
			{message.status === 'interrupted' && (
				<Box>
					<Gutter>
						<Text color={colors.warning}>{symbols.elbow}</Text>
					</Gutter>
					<Text color={colors.warning}>
						Interrupted {symbols.dot} <Text color={colors.muted}>what should TOOLCODE do instead?</Text>
					</Text>
				</Box>
			)}
			{message.status === 'error' && <ErrorBlock message={message.error ?? 'Unknown error'} />}
		</Box>
	);
}

function NoticeView({message}: {message: NoticeMessage}) {
	const {colors, symbols} = useTheme();
	const style = {
		info: {icon: symbols.info, color: colors.info},
		success: {icon: symbols.check, color: colors.success},
		warning: {icon: symbols.warning, color: colors.warning},
		error: {icon: symbols.cross, color: colors.error},
	}[message.level];
	return (
		<Box>
			<Gutter>
				<Text color={style.color}>{style.icon}</Text>
			</Gutter>
			<Box flexShrink={1}>
				<Text color={message.level === 'info' ? colors.muted : undefined}>{expandTabs(message.text)}</Text>
			</Box>
		</Box>
	);
}

interface Props {
	message: Message;
	expandTools: boolean;
}

/** One entry in the transcript. Memoized: only the streaming reply re-renders. */
export const MessageView = memo(function MessageView({message, expandTools}: Props) {
	const {colors, symbols} = useTheme();

	let body: ReactNode;
	switch (message.role) {
		case 'user':
			body = (
				<Box>
					<Gutter>
						<Text color={colors.primary} bold>
							{symbols.prompt}
						</Text>
					</Gutter>
					<Box flexShrink={1}>
						<Text bold>{expandTabs(message.text)}</Text>
					</Box>
				</Box>
			);
			break;
		case 'assistant':
			if (message.parts.length === 0 && message.status === 'streaming') return null;
			body = <AssistantView message={message} expandTools={expandTools} />;
			break;
		case 'notice':
			body = <NoticeView message={message} />;
			break;
	}

	return (
		<Box marginTop={1} flexDirection="column">
			{body}
		</Box>
	);
});
