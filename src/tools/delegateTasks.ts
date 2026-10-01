import {loadConfig} from '../agents/config.js';
import {formatChanges, formatDelegationResult, pickAgent, runDelegation, scopeChanges, statusText} from '../agents/delegate.js';
import {compareSnapshots, snapshotWorkspace} from '../agents/git.js';
import {parseTaskPlan, runTaskGraph} from '../agents/orchestrate.js';
import {delegationAvailable} from '../agents/registry.js';
import {countAttempt, grantCommands, resolveFiles} from './delegate.js';
import type {Tool} from './types.js';

export const delegateTasks: Tool = {
	name: 'delegate_tasks',
	label: 'Orchestrate',
	description:
		'Run a plan of subtasks on delegated coding agents. Each task starts once the tasks in its depends_on succeeded; independent tasks run in parallel when they list files that do not overlap. ' +
		'Failed tasks are retried once when that can help, and tasks depending on a failure are skipped. Returns each task\'s status, changes and summary, plus the combined workspace changes.',
	parameters: {
		type: 'object',
		properties: {
			tasks: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: {type: 'string', description: 'Short unique id, e.g. "backend".'},
						task: {type: 'string', description: 'What the agent should do, stated completely; it cannot see this conversation.'},
						agent: {type: 'string', description: 'Agent id; defaults to "claude-code".'},
						depends_on: {type: 'array', items: {type: 'string'}, description: 'Ids of tasks that must succeed first.'},
						files: {type: 'array', items: {type: 'string'}, description: 'Files or folders this task will change. Needed for it to run in parallel with others.'},
						context: {type: 'string', description: 'Background the agent needs.'},
						expected_result: {type: 'string', description: 'What done looks like.'},
						mode: {type: 'string', enum: ['implement', 'investigate']},
						allow_commands: {type: 'boolean', description: 'Let the agent run shell commands. The user may be asked to approve.'},
					},
					required: ['id', 'task'],
				},
			},
		},
		required: ['tasks'],
		additionalProperties: false,
	},
	readOnly: false,
	delegation: true,
	available: turn => turn.orchestrator && delegationAvailable(),
	describe: args => {
		const tasks = Array.isArray(args['tasks']) ? args['tasks'] : [];
		const ids = tasks.map(t => (t && typeof t === 'object' ? String((t as Record<string, unknown>)['id'] ?? '?') : '?'));
		return `${ids.length} task${ids.length === 1 ? '' : 's'}: ${ids.join(', ')}`;
	},
	async run(args, ctx) {
		const config = loadConfig();
		const tasks = parseTaskPlan(args['tasks']);
		for (const task of tasks) {
			pickAgent(task.agent);
			task.files = resolveFiles(task.files, ctx);
			countAttempt(ctx, pickAgent(task.agent), task.task, config.orchestrator.maxRetries);
		}

		// One question covers the batch, and only the tasks that asked for commands get them.
		const wantCommands = tasks.filter(t => t.allowCommands && t.mode === 'implement');
		const commands = wantCommands.length > 0 ? await grantCommands(pickAgent(wantCommands[0]!.agent), wantCommands.map(t => `${t.id}: ${t.task}`), ctx, config) : {allowed: false};

		const before = await snapshotWorkspace(ctx.cwd);
		const outcomes = await runTaskGraph(
			tasks,
			task =>
				runDelegation(
					{agent: task.agent, task: task.task, context: task.context, files: task.files, expected: task.expected, workdir: ctx.cwd, mode: task.mode, allowCommands: task.allowCommands && commands.allowed},
					{root: ctx.cwd, signal: ctx.signal},
				),
			{maxParallel: ctx.turn?.parallel === false ? 1 : config.orchestrator.maxParallel, maxRetries: config.orchestrator.maxRetries, signal: ctx.signal},
		);
		const after = await snapshotWorkspace(ctx.cwd);
		const total = await compareSnapshots(before, after, ctx.cwd);

		const sections = outcomes.map((o, i) => {
			// Parallel tasks see each other's edits; show each only what it owns.
			if (o.result && o.overlapped) o.result.changes = scopeChanges(o.result.changes, ctx.cwd, tasks[i]!.files, o.result.filesTouched);
			const head = `## ${o.id}: ${o.state}${o.attempts > 1 ? ` after ${o.attempts} attempts` : ''}`;
			const body = o.result ? formatDelegationResult(o.result) : `reason: ${o.reason ?? 'unknown'}`;
			const overlap = o.overlapped ? '\nnote: ran in parallel with other tasks, so its files_changed lists only its declared files and the files it reported editing; the combined changes below are complete.' : '';
			return `${head}\n${body}${overlap}`;
		});
		const done = outcomes.filter(o => o.state === 'success').length;
		const failed = outcomes.filter(o => o.state === 'failed');
		const skipped = outcomes.filter(o => o.state === 'skipped').length;
		const summary = [`${done}/${outcomes.length} tasks done`, failed.length && `${failed.length} failed`, skipped && `${skipped} skipped`].filter(Boolean).join(', ');
		const content = [
			...sections,
			'## combined workspace changes',
			...formatChanges(total),
			...(commands.note ? [`note: ${commands.note}`] : []),
		].join('\n\n');
		const output = outcomes.map(o => `${o.id}: ${o.result ? `${o.result.agent.name} ${statusText(o.result)}` : o.state}`).join('\n') + `\n\n${content}`;
		return {status: failed.length === 0 && skipped === 0 ? 'success' : 'error', summary, output, content};
	},
};
