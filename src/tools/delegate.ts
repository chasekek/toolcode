import {statSync} from 'node:fs';
import {agentConfig, loadConfig, type DelegationConfig} from '../agents/config.js';
import {formatDelegationResult, formatVerbose, oneLine, pickAgent, runDelegation} from '../agents/delegate.js';
import {delegationAvailable} from '../agents/registry.js';
import type {AgentProvider} from '../agents/types.js';
import {displayPath} from './paths.js';
import type {Tool, ToolContext} from './types.js';

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

export function stringList(value: unknown, name: string): string[] | undefined {
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) throw new Error(`"${name}" must be an array of strings.`);
	return value.map(v => v.trim()).filter(Boolean);
}

/** The directory an agent runs in: the workspace root unless the model names a folder inside it. */
export function resolveWorkdir(value: unknown, ctx: ToolContext): string {
	const dir = str(value);
	if (!dir || dir === '.' || dir === './') return ctx.cwd;
	const resolved = ctx.resolvePath(dir);
	let isDir = false;
	try {
		isDir = statSync(resolved).isDirectory();
	} catch {
		// Reported below.
	}
	if (!isDir) throw new Error(`working_directory "${dir}" is not a folder in the workspace.`);
	return resolved;
}

/** Workspace-relative paths, checked so a task can't point the agent outside the workspace. */
export function resolveFiles(files: string[] | undefined, ctx: ToolContext): string[] | undefined {
	return files?.map(file => displayPath(ctx.cwd, ctx.resolvePath(file)));
}

/**
 * Whether the agent may run shell commands. TOOLCODE itself has no shell tool,
 * so this is a new capability: it needs the config's "allow", or the user's yes.
 * Without an interactive UI to ask, the answer is no.
 */
export async function grantCommands(agent: AgentProvider, tasks: string[], ctx: ToolContext, config: DelegationConfig): Promise<{allowed: boolean; note?: string}> {
	const policy = agentConfig(agent.id, config).commands;
	if (policy === 'allow') return {allowed: true};
	if (policy === 'deny') return {allowed: false, note: `Shell commands are disabled for ${agent.name} in the TOOLCODE config.`};
	if (!ctx.ask) return {allowed: false, note: 'Shell commands need the user\'s approval, and there is no one to ask in this session.'};
	const answers = await ctx.ask([
		{
			question: `Let ${agent.name} run shell commands (tests, builds, git status) for this work?`,
			options: ['Allow', 'Deny'],
			context: tasks.map(t => `- ${t.length > 160 ? `${t.slice(0, 159)}…` : t}`).join('\n'),
		},
	]);
	const allowed = /^\s*(allow|yes|y)\b/i.test(answers?.[0] ?? '');
	return allowed ? {allowed} : {allowed, note: 'The user did not allow shell commands; the agent ran without them.'};
}

/** Counts an attempt at a task; throws once it has been tried too often. */
export function countAttempt(ctx: ToolContext, agent: AgentProvider, task: string, maxRetries: number): void {
	const attempts = (ctx.session.delegationAttempts ??= {});
	const key = `${agent.id}:${task.toLowerCase().replace(/\s+/g, ' ')}`;
	const tries = attempts[key] ?? 0;
	if (tries > maxRetries) {
		throw new Error(
			`This exact task was already delegated ${tries} times. Do not retry it again: do the work yourself, change the approach, or ask the user.`,
		);
	}
	attempts[key] = tries + 1;
}

export const delegate: Tool = {
	name: 'delegate',
	label: 'Delegate',
	description:
		'Hand a self-contained coding task to another coding agent (e.g. Claude Code), which works directly in the workspace and reports back with its status, the files it changed and a summary. ' +
		'Use it for large refactors, multi-file features, hard debugging, fixing failing tests, and anything that needs shell commands. ' +
		'The agent cannot see this conversation: put everything it needs in task and context. Check its changes afterwards.',
	parameters: {
		type: 'object',
		properties: {
			task: {type: 'string', description: 'What the agent should do, stated completely.'},
			agent: {type: 'string', description: 'Agent id; defaults to "claude-code".'},
			context: {type: 'string', description: 'Background the agent needs: decisions made, conventions, what was tried.'},
			files: {type: 'array', items: {type: 'string'}, description: 'Relevant files or folders, relative to the workspace.'},
			constraints: {type: 'array', items: {type: 'string'}, description: 'Rules the agent must follow.'},
			expected_result: {type: 'string', description: 'What done looks like, e.g. "all tests in test/auth pass".'},
			working_directory: {type: 'string', description: 'Folder to run in, relative to the workspace. Defaults to the workspace root.'},
			mode: {type: 'string', enum: ['implement', 'investigate'], description: 'implement edits files; investigate only reads and reports. Defaults to implement.'},
			allow_commands: {type: 'boolean', description: 'Let the agent run shell commands such as tests or builds. The user may be asked to approve.'},
			timeout_minutes: {type: 'number', description: 'Give up after this long. Defaults to 20.'},
		},
		required: ['task'],
		additionalProperties: false,
	},
	readOnly: false,
	delegation: true,
	available: () => delegationAvailable(),
	describe: args => {
		const task = str(args['task']) ?? '';
		let name = 'agent';
		try {
			name = pickAgent(str(args['agent'])).name;
		} catch {
			// Shown as-is; run() reports the problem.
		}
		return `${name}: ${task.length > 70 ? `${task.slice(0, 69)}…` : task}`;
	},
	async run(args, ctx) {
		const task = str(args['task']);
		if (!task) throw new Error('"task" is required.');
		const config = loadConfig();
		const agent = pickAgent(str(args['agent']));
		const workdir = resolveWorkdir(args['working_directory'], ctx);
		const files = resolveFiles(stringList(args['files'], 'files'), ctx);
		const constraints = stringList(args['constraints'], 'constraints');
		const mode = args['mode'] === 'investigate' || args['mode'] === 'implement' ? args['mode'] : agentConfig(agent.id, config).defaultMode;
		const timeout = typeof args['timeout_minutes'] === 'number' ? Math.min(240, Math.max(1, args['timeout_minutes'])) : undefined;
		countAttempt(ctx, agent, task, config.orchestrator.maxRetries);

		const commands = args['allow_commands'] === true && mode === 'implement' ? await grantCommands(agent, [task], ctx, config) : {allowed: false};
		const result = await runDelegation(
			{agent: agent.id, task, context: str(args['context']), files, constraints, expected: str(args['expected_result']), workdir, mode, allowCommands: commands.allowed, timeoutMinutes: timeout},
			{root: ctx.cwd, signal: ctx.signal},
		);
		const content = formatDelegationResult(result) + (commands.note ? `\n\nnote: ${commands.note}` : '');
		return {status: result.status === 'success' ? 'success' : 'error', summary: oneLine(result), output: formatVerbose(result), content};
	},
};
