import {Box, Text} from 'ink';
import type {FileChange, FileStatus} from '../activity.js';
import {truncateMiddle} from '../text.js';
import {useTheme, type Colors} from '../theme.js';
import {ListRow} from './ListRow.js';
import {Panel} from './Panel.js';

export function statusColor(status: FileStatus, colors: Colors): string {
	return status === 'A' ? colors.success : status === 'D' ? colors.error : colors.warning;
}

/** "+12" in green, "-3" in red, nothing for unknown or zero. */
export function Delta({delta, selected}: {delta: number | null; selected?: boolean}) {
	const {colors} = useTheme();
	if (!delta) return null;
	const color = selected ? colors.selectionText : delta > 0 ? colors.success : colors.error;
	return <Text color={color}>{delta > 0 ? `+${delta}` : String(delta)}</Text>;
}

interface Props {
	width: number;
	height: number;
	focused: boolean;
	files: FileChange[];
	selected: number;
	start: number;
}

/** [3] Files the agent created, edited or deleted, git-status style. */
export function FilesPanel({width, height, focused, files, selected, start}: Props) {
	const {colors, symbols} = useTheme();
	const rows = Math.max(0, height - 2);
	// Borders and padding, the status letter, and room for a delta like "+120".
	const pathWidth = Math.max(4, width - 4 - 2 - 5);
	const footer = files.length === 0 ? undefined : focused ? `${selected + 1} of ${files.length}` : `${files.length} changed`;

	return (
		<Panel title="Files" index={3} focused={focused} width={width} height={height} footer={footer && <Text color={colors.muted}>{footer}</Text>}>
			{files.length === 0 ? (
				<Text color={colors.muted} wrap="truncate-end">
					No changes yet
				</Text>
			) : (
				files.slice(start, start + rows).map((file, i) => {
					const isSelected = focused && start + i === selected;
					return (
						<ListRow key={file.path} selected={isSelected}>
							<Box width={2} flexShrink={0}>
								<Text color={statusColor(file.status, colors)} bold>
									{file.status}
								</Text>
							</Box>
							<Box flexGrow={1} flexShrink={1}>
								<Text
									color={isSelected ? colors.selectionText : file.status === 'D' ? colors.muted : undefined}
									strikethrough={file.status === 'D'}
									wrap="truncate-end"
								>
									{truncateMiddle(file.path, pathWidth, symbols.ellipsis)}
								</Text>
							</Box>
							<Box flexShrink={0} marginLeft={1}>
								<Delta delta={file.delta} selected={isSelected} />
							</Box>
						</ListRow>
					);
				})
			)}
		</Panel>
	);
}
