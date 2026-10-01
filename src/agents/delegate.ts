import path from 'node:path';
import {AbortError} from '../core/abort.js';
import {agentConfig, loadConfig} from './config.js';
import {compareSnapshots, countChanges, snapshotWorkspace, type WorkspaceChanges} from './git.js';
import {runProcess, type ProcessRunner} from './process.js';
import {enabledAgents, findAgent} from './registry.js';
import type {AgentMode, AgentProvider, AgentRunResult} from './types.js';

export interface DelegationRequest {
	/** Agent id, name or alias; the first enabled agent when omitted. */
	agent?: string;
	task: string;
	context?: string;
	/** Workspace-relative files or folders the task is about. */
	files?: string[];
	constraints?: string[];
	/** What done looks like. */
	expected?: string;
	/** Absolute directory the agent runs in; inside the workspace. */
	workdir: string;
	mode?: AgentMode;
	allowCommands: boolean;
	timeoutMinutes?: number;
}

export interface DelegationResult extends AgentRunResult {
	agent: AgentProvider;
	/** Workspace changes seen by comparing git status before and after. */
	changes: WorkspaceChanges;
	durationMs: number;
}

export interface DelegationOptions {
	/** Workspace root, for change tracking and display paths. */
	root: string;
	signal: AbortSignal;
	/** Runs git; injectable for tests. */
	git?: ProcessRunner;
}

/** Resolves which agent a request goes to; throws a message the model can act on. */
export function pickAgent(query: string | undefined): AgentProvider {
	const enabled = enabledAgents();
	if (query) {
		const agent = findAgent(query);
		if (!agent) throw new Error(`Unknown agent "${query}". Available: ${enabled.map(a => a.id).join(', ') || 'none'}.`);
		if (!enabled.includes(agent)) throw new Error(`${agent.name} is disabled in the TOOLCODE config.`);
		return agent;
	}
	const first = enabled[0];
	if (!first) throw new Error('No delegated agents are enabled.');
	return first;
}

/**
 * The task as the agent sees it. The agent does not see the conversation, so
 * everything it needs is spelled out here, and nothing else is.
 */
export function buildTaskPrompt(request: DelegationRequest, root: string): string {
	const mode = request.mode ?? 'implement';
	const relative = path.relative(root, request.workdir) || '.';
	const sections: Array<[string, string | undefined]> = [
		[
			'ROLE',
			'You are a delegated coding agent working for TOOLCODE, which coordinates this task and will review your work. Work only on the task below.',
		],
		['OBJECTIVE', request.task.trim()],
		['WORKING DIRECTORY', `${request.workdir}${relative !== '.' ? ` (${relative} in the workspace ${root})` : ''}`],
		['CONTEXT', request.context?.trim() || undefined],
		['RELEVANT FILES', request.files && request.files.length > 0 ? request.files.map(f => `- ${f}`).join('\n') : undefined],
		['CONSTRAINTS', request.constraints && request.constraints.length > 0 ? request.constraints.map(c => `- ${c}`).join('\n') : undefined],
		['EXPECTED RESULT', request.expected?.trim() || (mode === 'implement' ? 'The task is implemented in the workspace and works.' : 'A clear, specific answer to the objective.')],
		[
			'IMPORTANT',
			[
				mode === 'implement'
					? 'Modify the workspace directly. Do not merely describe how to do the task.'
					: 'This is an investigation: read and analyse, but do not modify any files.',
				request.allowCommands ? 'You may run shell commands, e.g. to build or run tests.' : 'Shell commands are not available for this task.',
				'Do not commit, reset, stash, check out, or otherwise discard changes, including changes that were already in the workspace.',
				'Do not start TOOLCODE or another Claude Code session; this task must not delegate further.',
				'Finish with a short summary: what you changed and why, commands you ran with their outcome, and anything left undone.',
			].join('\n'),
		],
	];
	return sections
		.filter((s): s is [string, string] => Boolean(s[1]))
		.map(([title, body]) => `${title}\n${body}`)
		.join('\n\n');
}

/** Runs one delegation: snapshot the workspace, run the agent, compare. */
export async function runDelegation(request: DelegationRequest, options: DelegationOptions): Promise<DelegationResult> {
	const agent = pickAgent(request.agent);
	const config = agentConfig(agent.id, loadConfig());
	const git = options.git ?? runProcess;
	const started = Date.now();
	const before = await snapshotWorkspace(options.root, git);
	const result = await agent.run({
		prompt: buildTaskPrompt(request, options.root),
		cwd: request.workdir,
		mode: request.mode ?? config.defaultMode,
		allowCommands: request.allowCommands,
		timeoutMs: Math.round((request.timeoutMinutes ?? config.timeoutMinutes) * 60_000),
		signal: options.signal,
	});
	if (options.signal.aborted) throw new AbortError();
	const after = await snapshotWorkspace(options.root, git);
	const changes = await compareSnapshots(before, after, options.root, git);
	return {...result, agent, changes, durationMs: Date.now() - started};
}

const STATUS_TEXT: Record<AgentRunResult['status'], string> = {
	success: 'finished',
	failure: 'failed',
	timeout: 'timed out',
	not_installed: 'is not installed',
	permission_error: 'hit a permission error',
	unknown_error: 'stopped unexpectedly',
};

export function statusText(result: Pick<DelegationResult, 'status'>): string {
	return STATUS_TEXT[result.status];
}

function tail(text: string, max: number): string {
	const trimmed = text.trim();
	return trimmed.length > max ? `…${trimmed.slice(-max)}` : trimmed;
}

const list = (items: string[]) => items.slice(0, 40).join(', ') + (items.length > 40 ? `, … (${items.length - 40} more)` : '');

/**
 * Narrows changes to the files one task owns: those it declared, plus those the
 * agent says it edited. Used when tasks ran in parallel and saw each other's work.
 */
export function scopeChanges(changes: WorkspaceChanges, root: string, declared: string[] = [], touched: string[] = []): WorkspaceChanges {
	const owned = new Set(touched.map(file => path.relative(root, path.resolve(root, file)).split(path.sep).join('/')));
	// Declared files arrive workspace-relative with forward slashes (see resolveFiles).
	const prefixes = declared.filter(d => d && d !== '.');
	const keep = (file: string) => owned.has(file) || prefixes.some(p => file === p || file.startsWith(`${p}/`));
	return {
		...changes,
		added: changes.added.filter(keep),
		modified: changes.modified.filter(keep),
		deleted: changes.deleted.filter(keep),
		reverted: changes.reverted.filter(keep),
		preexisting: changes.preexisting.filter(keep),
		diffStat: undefined,
	};
}

/** Lines describing workspace changes, shared by single and batched results. */
export function formatChanges(changes: WorkspaceChanges): string[] {
	if (!changes.available) return ['files_changed: unavailable (not a git repository; read the files to check)'];
	const lines = [`files_changed: ${countChanges(changes)}`];
	if (changes.added.length) lines.push(`  added: ${list(changes.added)}`);
	if (changes.modified.length) lines.push(`  modified: ${list(changes.modified)}`);
	if (changes.deleted.length) lines.push(`  deleted: ${list(changes.deleted)}`);
	if (changes.reverted.length) lines.push(`  reverted to committed state: ${list(changes.reverted)}`);
	if (changes.preexisting.length) lines.push(`  note: these already had uncommitted changes before the run: ${list(changes.preexisting)}`);
	if (changes.headMoved) lines.push('  warning: git HEAD moved during the run (a commit, checkout or reset happened)');
	if (changes.diffStat) lines.push('diff_stat:', changes.diffStat);
	return lines;
}

/** The tool result the model reads: structured fields, then the agent's summary. */
export function formatDelegationResult(result: DelegationResult): string {
	const lines = [
		`agent: ${result.agent.name}`,
		`status: ${result.status}`,
		`exit_code: ${result.exitCode ?? 'unavailable'}`,
		`duration_s: ${Math.round(result.durationMs / 1000)}`,
		...formatChanges(result.changes),
		`commands_run: ${result.commandsRun ? (result.commandsRun.length ? '\n' + result.commandsRun.map(c => `  $ ${c}`).join('\n') : 'none') : 'unavailable'}`,
	];
	if (result.permissionDenials?.length) lines.push(`permission_denied: ${result.permissionDenials.join('; ')}`);
	lines.push('', 'summary:', result.summary?.trim() || '(the agent gave no summary)');
	if (result.status !== 'success' && result.stderr.trim()) lines.push('', 'stderr (tail):', tail(result.stderr, 2000));
	return lines.join('\n');
}

/** Full output for the expanded view (ctrl+o): everything the agent printed. */
export function formatVerbose(result: DelegationResult): string {
	const parts = [formatDelegationResult(result)];
	if (result.stdout.trim()) parts.push('--- stdout ---', tail(result.stdout, 20000));
	if (result.stderr.trim()) parts.push('--- stderr ---', tail(result.stderr, 5000));
	return parts.join('\n');
}

/** One-line UI label, e.g. "Claude Code finished: 3 files changed". */
export function oneLine(result: DelegationResult): string {
	const count = countChanges(result.changes);
	const files = result.changes.available ? `: ${count} file${count === 1 ? '' : 's'} changed` : '';
	return `${result.agent.name} ${statusText(result)}${files}`;
}
