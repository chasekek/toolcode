import {Box, Text} from 'ink';
import {allCommands, shortcuts} from '../commands.js';
import {useTheme} from '../theme.js';
import {APP_NAME, VERSION} from '../../version.js';

function Row({left, right, leftWidth, color}: {left: string; right: string; leftWidth: number; color?: string}) {
	const {colors} = useTheme();
	return (
		<Box>
			<Box width={leftWidth} flexShrink={0}>
				<Text color={color}>{left}</Text>
			</Box>
			<Box flexShrink={1}>
				<Text color={colors.muted}>{right}</Text>
			</Box>
		</Box>
	);
}

export function HelpView() {
	const {colors} = useTheme();
	const commands = allCommands();
	const commandWidth = Math.max(...commands.map(c => `${c.name} ${c.args ?? ''}`.length)) + 2;
	const shortcutWidth = Math.max(...shortcuts.map(s => s.keys.length)) + 2;

	return (
		<Box flexDirection="column">
			<Text bold>
				{APP_NAME} <Text color={colors.muted}>v{VERSION}</Text>
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Text bold color={colors.primary}>
					Commands
				</Text>
				{commands.map(c => (
					<Row
						key={c.name}
						left={`${c.name}${c.args ? ` ${c.args}` : ''}`}
						right={c.description}
						leftWidth={commandWidth}
						color={colors.primary}
					/>
				))}
			</Box>
			<Box flexDirection="column" marginTop={1}>
				<Text bold color={colors.primary}>
					Shortcuts
				</Text>
				{shortcuts.map(s => (
					<Row key={s.keys} left={s.keys} right={s.description} leftWidth={shortcutWidth} />
				))}
			</Box>
		</Box>
	);
}
