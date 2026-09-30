import {Box, Text} from 'ink';
import type {ToolCall} from '../../core/types.js';
import {plural} from '../text.js';
import {useTheme} from '../theme.js';
import {ListRow} from './ListRow.js';
import {Panel} from './Panel.js';
import {ToolIcon} from './ToolCallView.js';

interface Props {
	width: number;
	height: number;
	focused: boolean;
	calls: ToolCall[];
	selected: number;
	start: number;
}

/** [4] Every tool call this session; select one to read its full output. */
export function ToolsPanel({width, height, focused, calls, selected, start}: Props) {
	const {colors} = useTheme();
	const rows = Math.max(0, height - 2);
	const labelWidth = Math.min(8, Math.max(0, ...calls.map(c => c.name.length))) + 1;
	const running = calls.filter(c => c.status === 'running').length;
	const footer =
		calls.length === 0 ? undefined : focused ? `${selected + 1} of ${calls.length}` : running > 0 ? `${running} running` : plural(calls.length, 'call');

	return (
		<Panel
			title="Tools"
			index={4}
			focused={focused}
			width={width}
			height={height}
			footer={footer && <Text color={running > 0 && !focused ? colors.warning : colors.muted}>{footer}</Text>}
		>
			{calls.length === 0 ? (
				<Text color={colors.muted} wrap="truncate-end">
					No tool calls yet
				</Text>
			) : (
				calls.slice(start, start + rows).map((call, i) => {
					const isSelected = focused && start + i === selected;
					return (
						<ListRow key={`${call.id}:${start + i}`} selected={isSelected}>
							<Box width={2} flexShrink={0}>
								<ToolIcon status={call.status} />
							</Box>
							<Box width={labelWidth} flexShrink={0}>
								<Text bold color={isSelected ? colors.selectionText : undefined} wrap="truncate-end">
									{call.name}
								</Text>
							</Box>
							<Box flexShrink={1}>
								<Text color={isSelected ? colors.selectionText : colors.muted} wrap="truncate-end">
									{call.args}
								</Text>
							</Box>
						</ListRow>
					);
				})
			)}
		</Panel>
	);
}
