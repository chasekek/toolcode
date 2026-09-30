import type {ReactNode} from 'react';
import {Box, Text} from 'ink';
import {phaseOf, waitingOn, type Todo} from '../../core/todos.js';
import type {Settings, ToolCall} from '../../core/types.js';
import type {LoadedPlugin} from '../../plugins/types.js';
import {keySource} from '../../providers/registry.js';
import type {Provider} from '../../providers/types.js';
import type {FileChange} from '../activity.js';
import {useTheme} from '../theme.js';
import {Delta, statusColor} from './FilesPanel.js';
import {ListRow} from './ListRow.js';
import {ProgressBar} from './ProgressBar.js';
import {TodoRow} from './TodosPanel.js';
import {OutputLines, ToolIcon, toolSummary} from './ToolCallView.js';

/** Where the output starts in a tool or file view: two header lines and a gap. */
const OUTPUT_ROW = 3;
/** Extra lines rendered around the visible ones, so small scrolls reuse what is drawn. */
const WINDOW_MARGIN = 10;

/** The slice of output lines on screen when the view is scrolled `top` rows down. */
function outputWindow(top: number, viewport: number): {start: number; size: number} {
	const start = Math.max(0, top - OUTPUT_ROW - WINDOW_MARGIN);
	return {start, size: viewport + 2 * WINDOW_MARGIN};
}

export type Detail =
	| {kind: 'tool'; call: ToolCall}
	| {kind: 'file'; file: FileChange}
	| {kind: 'plan'; todos: Todo[]; selected: number}
	| {kind: 'session'; providers: Provider[]; plugins: LoadedPlugin[]; settings: Settings; cwd: string; currentProvider: string};

function Section({title, children}: {title: string; children: ReactNode}) {
	const {colors} = useTheme();
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold color={colors.primary}>
				{title}
			</Text>
			{children}
		</Box>
	);
}

function ToolDetail({call, top, viewport}: {call: ToolCall; top: number; viewport: number}) {
	const {colors, symbols} = useTheme();
	return (
		<Box flexDirection="column">
			<Box>
				<Box width={2} flexShrink={0}>
					<ToolIcon status={call.status} />
				</Box>
				<Text wrap="truncate-end">
					<Text bold>{call.name}</Text>
					{call.args && <Text color={colors.muted}> {call.args}</Text>}
				</Text>
			</Box>
			<Box paddingLeft={2}>
				<Text color={call.status === 'error' ? colors.error : colors.muted} wrap="truncate-end">
					{toolSummary(call, symbols.ellipsis, symbols.dot)}
				</Text>
			</Box>
			<Box marginTop={1} flexDirection="column">
				{call.status === 'running' ? null : call.output ? (
					<OutputLines call={call} window={outputWindow(top, viewport)} />
				) : (
					<Text color={colors.muted}>No output.</Text>
				)}
			</Box>
		</Box>
	);
}

function FileDetail({file, top, viewport}: {file: FileChange; top: number; viewport: number}) {
	const {colors, symbols} = useTheme();
	const verb = {A: 'Created', M: 'Modified', D: 'Deleted'}[file.status];
	return (
		<Box flexDirection="column">
			<Box>
				<Box width={2} flexShrink={0}>
					<Text color={statusColor(file.status, colors)} bold>
						{file.status}
					</Text>
				</Box>
				<Text wrap="truncate-end">
					<Text bold>{file.path}</Text> <Delta delta={file.delta} />
				</Text>
			</Box>
			<Box paddingLeft={2}>
				<Text color={colors.muted} wrap="truncate-end">
					{verb} this session {symbols.dot} last: {file.call.summary}
				</Text>
			</Box>
			<Box marginTop={1} flexDirection="column">
				{file.status === 'D' ? (
					<Text color={colors.muted}>The file was deleted.</Text>
				) : file.call.output ? (
					<OutputLines call={file.call} window={outputWindow(top, viewport)} />
				) : (
					<Text color={colors.muted}>No content recorded.</Text>
				)}
			</Box>
		</Box>
	);
}

function PlanDetail({todos, selected}: {todos: Todo[]; selected: number}) {
	const {colors} = useTheme();
	const done = todos.filter(t => t.status === 'done').length;
	if (todos.length === 0) {
		return (
			<Text color={colors.muted} wrap="wrap">
				No plan yet. Ask for something bigger than a one-liner and the agent will break it into tasks here.
			</Text>
		);
	}
	const idWidth = Math.max(...todos.map(t => t.id.length)) + 2;
	return (
		<Box flexDirection="column">
			<Text bold>
				{done} of {todos.length} done
			</Text>
			<Box width={40} marginBottom={1}>
				<ProgressBar done={done} total={todos.length} width={40} />
			</Box>
			{todos.map((todo, i) => {
				const phase = phaseOf(todo, todos);
				const waiting = waitingOn(todo, todos);
				const note = phase === 'blocked' ? `waiting on ${waiting.join(', ')}` : todo.deps.length > 0 ? `after ${todo.deps.join(', ')}` : '';
				const isSelected = i === selected;
				return (
					<Box key={todo.id}>
						<Box width={idWidth} flexShrink={0}>
							<Text color={colors.muted}>{todo.id}</Text>
						</Box>
						<Box flexGrow={1} flexShrink={1} flexDirection="column">
							<TodoRow todo={todo} todos={todos} selected={isSelected} />
						</Box>
						{note && (
							<Box flexShrink={0} marginLeft={2}>
								<Text color={phase === 'blocked' ? colors.warning : colors.muted}>{note}</Text>
							</Box>
						)}
					</Box>
				);
			})}
		</Box>
	);
}

function SessionDetail({detail}: {detail: Extract<Detail, {kind: 'session'}>}) {
	const {colors, symbols} = useTheme();
	const {providers, plugins, settings, cwd, currentProvider} = detail;
	const nameWidth = Math.max(...providers.map(p => p.name.length)) + 2;
	const on = (value: boolean | undefined) => (value ? 'on' : 'off');
	return (
		<Box flexDirection="column">
			<Section title="Providers">
				{providers.map(provider => {
					const source = keySource(provider);
					const key =
						source === 'not-needed'
							? {text: 'no key needed', color: colors.muted}
							: source === 'none'
								? {text: `${provider.apiKeyEnv} missing ${symbols.dot} /auth`, color: colors.warning}
								: {text: source === 'env' ? `${provider.apiKeyEnv} from env` : 'key saved', color: colors.success};
					return (
						<ListRow key={provider.id} selected={false}>
							<Box width={2} flexShrink={0}>
								<Text color={provider.id === currentProvider ? colors.accent : colors.muted}>
									{provider.id === currentProvider ? symbols.bullet : symbols.toggleOff}
								</Text>
							</Box>
							<Box width={nameWidth} flexShrink={0}>
								<Text bold={provider.id === currentProvider}>{provider.name}</Text>
							</Box>
							<Box flexShrink={1} flexGrow={1}>
								<Text color={key.color} wrap="truncate-end">
									{key.text}
								</Text>
							</Box>
							<Box flexShrink={0} marginLeft={2}>
								<Text color={colors.muted}>
									{provider.models.length} model{provider.models.length === 1 ? '' : 's'}
								</Text>
							</Box>
						</ListRow>
					);
				})}
			</Section>
			<Section title="Plugins">
				{plugins.length === 0 ? (
					<Text color={colors.muted}>None loaded {symbols.dot} browse /marketplace</Text>
				) : (
					plugins.map(plugin => {
						const parts = [
							plugin.tools.length > 0 && `tools: ${plugin.tools.join(', ')}`,
							plugin.providers.length > 0 && `providers: ${plugin.providers.join(', ')}`,
							plugin.commands.length > 0 && `commands: ${plugin.commands.join(', ')}`,
						].filter(Boolean);
						return (
							<Text key={plugin.file} wrap="truncate-end">
								<Text color={colors.accent}>{symbols.iconTool} </Text>
								{plugin.name}
								<Text color={colors.muted}> {parts.join(` ${symbols.dot} `)}</Text>
							</Text>
						);
					})
				)}
			</Section>
			<Section title="Settings">
				<Text color={colors.muted} wrap="wrap">
					unicode {on(settings.unicode)} {symbols.dot} mouse {on(settings.mouse)} {symbols.dot} expand tools {on(settings.expandTools)}{' '}
					{symbols.dot} change them in /config
				</Text>
			</Section>
			<Section title="Workspace">
				<Text color={colors.muted} wrap="wrap">
					{cwd}
				</Text>
			</Section>
		</Box>
	);
}

interface Props {
	detail: Detail;
	/** Rows scrolled past and rows visible, so long output renders only what is on screen. */
	top: number;
	viewport: number;
}

/** What the main panel shows while a side panel has focus, like lazygit's diff view. */
export function DetailView({detail, top, viewport}: Props) {
	switch (detail.kind) {
		case 'tool':
			return <ToolDetail call={detail.call} top={top} viewport={viewport} />;
		case 'file':
			return <FileDetail file={detail.file} top={top} viewport={viewport} />;
		case 'plan':
			return <PlanDetail todos={detail.todos} selected={detail.selected} />;
		case 'session':
			return <SessionDetail detail={detail} />;
	}
}
