import {Box, Text} from 'ink';
import type {ToolCall} from '../../core/types.js';
import {useTheme} from '../theme.js';
import {SpinnerIcon} from './Spinner.js';

const MAX_EXPANDED_LINES = 30;

interface Props {
	call: ToolCall;
	expanded: boolean;
}

/**
 * One tool invocation: status icon, name and arguments, then a result line.
 * Output stays collapsed to its summary unless expanded with ctrl+o.
 */
export function ToolCallView({call, expanded}: Props) {
	const {colors, symbols} = useTheme();
	const outputLines = call.output ? call.output.split('\n') : [];
	const shown = outputLines.slice(0, MAX_EXPANDED_LINES);
	const hidden = outputLines.length - shown.length;

	const icon =
		call.status === 'running' ? (
			<SpinnerIcon color={colors.warning} />
		) : (
			<Text color={call.status === 'success' ? colors.success : colors.error}>{symbols.bullet}</Text>
		);

	return (
		<Box flexDirection="column">
			<Box>
				<Box width={2} flexShrink={0}>
					{icon}
				</Box>
				<Text wrap="truncate-end">
					<Text bold>{call.name}</Text>
					{call.args && <Text color={colors.muted}>({call.args})</Text>}
				</Text>
			</Box>
			<Box paddingLeft={2}>
				<Box width={3} flexShrink={0}>
					<Text color={colors.muted}>{symbols.elbow}</Text>
				</Box>
				<Box flexDirection="column" flexShrink={1}>
					{call.status === 'running' ? (
						<Text color={colors.muted}>Running{symbols.ellipsis}</Text>
					) : (
						<Text wrap="truncate-end">
							<Text color={call.status === 'error' ? colors.error : undefined}>{call.summary}</Text>
							{outputLines.length > 0 && (
								<Text color={colors.muted}> (ctrl+o to {expanded ? 'collapse' : 'expand'})</Text>
							)}
						</Text>
					)}
					{expanded && call.status !== 'running' && shown.length > 0 && (
						<Box flexDirection="column" marginTop={0}>
							{shown.map((line, i) => (
								<Text key={i} color={colors.muted} wrap="truncate-end">
									{line || ' '}
								</Text>
							))}
							{hidden > 0 && (
								<Text color={colors.muted}>
									{symbols.ellipsis} +{hidden} more lines
								</Text>
							)}
						</Box>
					)}
				</Box>
			</Box>
		</Box>
	);
}
