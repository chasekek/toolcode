import {Box, Text} from 'ink';
import type {SlashCommand} from '../commands.js';
import {useTheme} from '../theme.js';

interface Props {
	items: SlashCommand[];
	selected: number;
	width: number;
}

export function CommandMenu({items, selected, width}: Props) {
	const {colors, symbols} = useTheme();
	const nameWidth = Math.max(...items.map(c => `${c.name} ${c.args ?? ''}`.length)) + 2;
	const showDescriptions = width >= nameWidth + 20;

	return (
		<Box flexDirection="column" paddingX={2}>
			{items.map((c, i) => {
				const active = i === selected;
				return (
					<Box key={c.name}>
						<Box width={2} flexShrink={0}>
							<Text color={colors.primary}>{active ? symbols.pointer : ' '}</Text>
						</Box>
						<Box width={nameWidth} flexShrink={0}>
							<Text color={active ? colors.primary : undefined} bold={active}>
								{c.name}
								{c.args && <Text color={colors.muted}> {c.args}</Text>}
							</Text>
						</Box>
						{showDescriptions && (
							<Box flexShrink={1}>
								<Text color={colors.muted} wrap="truncate-end">
									{c.description}
								</Text>
							</Box>
						)}
					</Box>
				);
			})}
		</Box>
	);
}
