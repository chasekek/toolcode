import {Box, Text} from 'ink';
import {phaseOf, type Phase, type Todo} from '../../core/todos.js';
import {useTheme, type Colors, type Symbols} from '../theme.js';
import {ListRow} from './ListRow.js';
import {Panel} from './Panel.js';
import {ProgressBar} from './ProgressBar.js';

/** Icon and color for each phase of a task. */
export function phaseStyle(phase: Phase, colors: Colors, symbols: Symbols): {icon: string; color: string | undefined} {
	return {
		done: {icon: symbols.todoDone, color: colors.success},
		doing: {icon: symbols.todoDoing, color: colors.accent},
		ready: {icon: symbols.todoReady, color: undefined},
		blocked: {icon: symbols.todoBlocked, color: colors.muted},
	}[phase];
}

/** One task: phase icon and text, struck through once done. */
export function TodoRow({todo, todos, selected}: {todo: Todo; todos: Todo[]; selected: boolean}) {
	const {colors, symbols} = useTheme();
	const phase = phaseOf(todo, todos);
	const style = phaseStyle(phase, colors, symbols);
	return (
		<ListRow selected={selected}>
			<Box width={symbols.todoDone.length + 1} flexShrink={0}>
				<Text color={style.color}>{style.icon}</Text>
			</Box>
			<Text
				wrap="truncate-end"
				color={selected ? colors.selectionText : phase === 'done' || phase === 'blocked' ? colors.muted : undefined}
				bold={phase === 'doing' || selected}
				strikethrough={phase === 'done'}
			>
				{todo.text}
			</Text>
		</ListRow>
	);
}

interface Props {
	width: number;
	height: number;
	focused: boolean;
	todos: Todo[];
	selected: number;
	/** First task in view. */
	start: number;
}

/** [2] The agent's task list with overall progress. */
export function TodosPanel({width, height, focused, todos, selected, start}: Props) {
	const {colors} = useTheme();
	const done = todos.filter(t => t.status === 'done').length;
	const rows = Math.max(0, height - 3);
	const footer = todos.length === 0 ? undefined : focused ? `${selected + 1} of ${todos.length}` : `${done}/${todos.length}`;

	return (
		<Panel title="Todos" index={2} focused={focused} width={width} height={height} footer={footer && <Text color={colors.muted}>{footer}</Text>}>
			{todos.length === 0 ? (
				<Text color={colors.muted} wrap="truncate-end">
					No tasks yet
				</Text>
			) : (
				<>
					<ProgressBar done={done} total={todos.length} width={Math.max(0, width - 4)} />
					{todos.slice(start, start + rows).map((todo, i) => (
						<TodoRow key={todo.id} todo={todo} todos={todos} selected={focused && start + i === selected} />
					))}
				</>
			)}
		</Panel>
	);
}
