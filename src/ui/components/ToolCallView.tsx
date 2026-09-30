import {memo, useMemo} from 'react';
import {Box, Text} from 'ink';
import type {ToolCall} from '../../core/types.js';
import {languageFor} from '../highlight.js';
import {expandTabs, formatDuration} from '../text.js';
import {useTheme} from '../theme.js';
import {CodeLine, highlightLines} from './Markdown.js';
import {SpinnerIcon} from './Spinner.js';

const MAX_EXPANDED_LINES = 30;
const SHOW_DURATION_MS = 100;

/** Spinner while running, then a check or a cross. */
export function ToolIcon({status}: {status: ToolCall['status']}) {
	const {colors, symbols} = useTheme();
	if (status === 'running') return <SpinnerIcon color={colors.warning} />;
	return <Text color={status === 'success' ? colors.success : colors.error}>{status === 'success' ? symbols.check : symbols.cross}</Text>;
}

/** "Read 12 lines · 0.7s", or what the call is doing while it runs. */
export function toolSummary(call: ToolCall, ellipsis: string, dot: string): string {
	if (call.status === 'running') return `running${ellipsis}`;
	// Only slow calls are worth a duration; most file tools finish in a millisecond.
	const ms = call.startedAt && call.endedAt ? call.endedAt - call.startedAt : 0;
	const took = ms >= SHOW_DURATION_MS ? ` ${dot} ${formatDuration(ms)}` : '';
	return `${call.summary ?? ''}${took}`;
}

interface OutputProps {
	call: ToolCall;
	/** Show at most this many lines, then say how many more there are. */
	max?: number;
	/**
	 * Render only lines [start, start + size) and hold the place of the rest
	 * with empty rows, so a file of thousands of lines costs one screenful per
	 * frame. Every line is exactly one row (long lines are cut), which keeps
	 * the placeholders exact.
	 */
	window?: {start: number; size: number};
}

/** Output lines with a line-number gutter, highlighted when the argument names a source file. */
export function OutputLines({call, max, window}: OutputProps) {
	const {colors, symbols} = useTheme();
	// Splitting and highlighting a big file is the expensive part: once per output, not per frame.
	const {total, highlighted} = useMemo(() => {
		const lines = expandTabs(call.output ?? '').replace(/\n$/, '').split('\n');
		const shown = max === undefined ? lines : lines.slice(0, max);
		return {total: lines.length, highlighted: highlightLines(shown, languageFor(call.args))};
	}, [call.output, call.args, max]);
	const hidden = total - highlighted.length;
	const gutter = String(total).length + 1;
	const from = window ? Math.max(0, Math.min(window.start, highlighted.length)) : 0;
	const to = window ? Math.min(highlighted.length, from + window.size) : highlighted.length;
	return (
		<Box flexDirection="column">
			{from > 0 && <Box height={from} flexShrink={0} />}
			{highlighted.slice(from, to).map((tokens, i) => (
				<Box key={from + i} height={1}>
					<Box width={gutter + 1} flexShrink={0}>
						<Text color={colors.border}>{String(from + i + 1).padStart(gutter)}</Text>
					</Box>
					<Box width={2} flexShrink={0}>
						<Text color={colors.border}>{symbols.box.vertical}</Text>
					</Box>
					<Box flexShrink={1}>
						<CodeLine tokens={tokens} wrap="truncate-end" />
					</Box>
				</Box>
			))}
			{to < highlighted.length && <Box height={highlighted.length - to} flexShrink={0} />}
			{hidden > 0 && (
				<Text color={colors.muted}>
					{symbols.ellipsis} {hidden} more lines {symbols.dot} focus Tools <Text color={colors.primary}>[4]</Text> to read it all
				</Text>
			)}
		</Box>
	);
}

interface Props {
	call: ToolCall;
	expanded: boolean;
}

/**
 * One tool invocation: status, name and arguments on the left, the result
 * on the right. Output stays collapsed unless expanded with ctrl+o.
 */
export const ToolCallView = memo(function ToolCallView({call, expanded}: Props) {
	const {colors, symbols} = useTheme();
	const hasOutput = Boolean(call.output) && call.status !== 'running';
	const summary = toolSummary(call, symbols.ellipsis, symbols.dot);

	return (
		<Box flexDirection="column">
			<Box>
				<Box width={2} flexShrink={0}>
					<ToolIcon status={call.status} />
				</Box>
				<Box flexShrink={1} flexGrow={1} marginRight={2}>
					<Text wrap="truncate-end">
						<Text bold>{call.name}</Text>
						{call.args && <Text color={colors.muted}> {call.args}</Text>}
					</Text>
				</Box>
				<Box flexShrink={2}>
					<Text color={call.status === 'error' ? colors.error : colors.muted} wrap="truncate-end">
						{summary}
					</Text>
				</Box>
			</Box>
			{expanded && hasOutput && (
				<Box paddingLeft={2} marginTop={0}>
					<OutputLines call={call} max={MAX_EXPANDED_LINES} />
				</Box>
			)}
		</Box>
	);
});
