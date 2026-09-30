import {Box, Text} from 'ink';
import {phaseOf, type Todo} from '../../core/todos.js';
import {useTheme} from '../theme.js';

const MAX_SHOWN = 8;

/** The agent's task list, shown above the prompt while any task is unfinished. */
export function TodoPanel({todos}: {todos: Todo[]}) {
	const {colors, symbols} = useTheme();
	if (todos.length === 0 || todos.every(t => t.status === 'done')) return null;

	// Keep the active part of the list in view: start just before the first unfinished task.
	const firstOpen = todos.findIndex(t => t.status !== 'done');
	const start = Math.max(0, Math.min(firstOpen - 1, todos.length - MAX_SHOWN));
	const shown = todos.slice(start, start + MAX_SHOWN);
	const done = todos.filter(t => t.status === 'done').length;

	return (
		<Box flexDirection="column" paddingX={2} marginTop={1}>
			<Text color={colors.muted}>
				Todos {done}/{todos.length}
				{start > 0 && ` ${symbols.dot} ${start} done above`}
			</Text>
			{shown.map(todo => {
				const phase = phaseOf(todo, todos);
				const style = {
					done: {icon: symbols.todoDone, color: colors.success},
					doing: {icon: symbols.todoDoing, color: colors.accent},
					ready: {icon: symbols.todoReady, color: undefined},
					blocked: {icon: symbols.todoBlocked, color: colors.muted},
				}[phase];
				return (
					<Box key={todo.id}>
						<Box width={symbols.todoDone.length + 1} flexShrink={0}>
							<Text color={style.color}>{style.icon}</Text>
						</Box>
						<Text
							wrap="truncate-end"
							color={phase === 'done' || phase === 'blocked' ? colors.muted : undefined}
							bold={phase === 'doing'}
							strikethrough={phase === 'done'}
						>
							{todo.text}
						</Text>
					</Box>
				);
			})}
			{start + MAX_SHOWN < todos.length && (
				<Text color={colors.muted}>
					{symbols.ellipsis} +{todos.length - start - MAX_SHOWN} more
				</Text>
			)}
		</Box>
	);
}
