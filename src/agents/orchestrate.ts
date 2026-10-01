import {AbortError} from '../core/abort.js';
import {findCycle} from '../core/todos.js';
import type {AgentMode, AgentStatus} from './types.js';

/** One node of an orchestrator plan, as sent by the model. */
export interface PlannedTask {
	id: string;
	task: string;
	agent?: string;
	/** Ids of tasks that must succeed first. */
	deps: string[];
	/** Files or folders the task will change; tasks that share none may run in parallel. */
	files?: string[];
	context?: string;
	expected?: string;
	mode: AgentMode;
	allowCommands: boolean;
}

export type TaskState = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface TaskOutcome<R> {
	id: string;
	state: Exclude<TaskState, 'pending' | 'running'>;
	attempts: number;
	result?: R;
	/** Why a task was skipped or failed without a result. */
	reason?: string;
	/** It ran while another task did, so its observed file changes may include theirs. */
	overlapped: boolean;
}

export interface GraphOptions {
	maxParallel: number;
	maxRetries: number;
	signal: AbortSignal;
}

const MAX_TASKS = 20;
// Retrying cannot fix a missing CLI or a refused permission; it can fix a flaky run.
const RETRYABLE: AgentStatus[] = ['failure', 'timeout', 'unknown_error'];

/** Validates a plan from the model; throws with a message it can act on. */
export function parseTaskPlan(value: unknown): PlannedTask[] {
	if (!Array.isArray(value) || value.length === 0) throw new Error('"tasks" must be a non-empty array.');
	if (value.length > MAX_TASKS) throw new Error(`At most ${MAX_TASKS} tasks per batch.`);
	const tasks = value.map((raw, i): PlannedTask => {
		const item = (raw ?? {}) as Record<string, unknown>;
		const id = typeof item['id'] === 'number' ? String(item['id']) : item['id'];
		if (typeof id !== 'string' || !id.trim()) throw new Error(`Task #${i + 1} needs an "id".`);
		if (typeof item['task'] !== 'string' || !item['task'].trim()) throw new Error(`Task "${id}" needs a "task" description.`);
		const deps = item['depends_on'] ?? [];
		if (!Array.isArray(deps)) throw new Error(`Task "${id}": "depends_on" must be an array of ids.`);
		const files = item['files'];
		if (files !== undefined && (!Array.isArray(files) || files.some(f => typeof f !== 'string'))) throw new Error(`Task "${id}": "files" must be an array of paths.`);
		return {
			id: id.trim(),
			task: item['task'].trim(),
			agent: typeof item['agent'] === 'string' ? item['agent'] : undefined,
			deps: deps.map(String),
			files: files as string[] | undefined,
			context: typeof item['context'] === 'string' ? item['context'] : undefined,
			expected: typeof item['expected_result'] === 'string' ? item['expected_result'] : undefined,
			mode: item['mode'] === 'investigate' ? 'investigate' : 'implement',
			allowCommands: item['allow_commands'] === true,
		};
	});
	const ids = new Set<string>();
	for (const task of tasks) {
		if (ids.has(task.id)) throw new Error(`Duplicate task id "${task.id}".`);
		ids.add(task.id);
	}
	for (const task of tasks) {
		for (const dep of task.deps) if (!ids.has(dep)) throw new Error(`Task "${task.id}" depends on unknown id "${dep}".`);
	}
	const cycle = findCycle(tasks);
	if (cycle) throw new Error(`Dependency cycle: ${cycle.join(' -> ')}.`);
	return tasks;
}

const norm = (file: string) => file.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
const overlaps = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || a === '.' || b === '.' || !a || !b;

/**
 * Whether two tasks can share the workspace at the same time: one of them only
 * reads, or both declared their files and none overlap. An editing task that
 * declared nothing might touch anything, so it runs alone.
 */
export function canRunTogether(a: PlannedTask, b: PlannedTask): boolean {
	if (a.mode === 'investigate' || b.mode === 'investigate') return true;
	if (!a.files?.length || !b.files?.length) return false;
	return a.files.every(fa => b.files!.every(fb => !overlaps(norm(fa), norm(fb))));
}

/**
 * Runs a task graph: a task starts once all its dependencies succeeded, up to
 * `maxParallel` at a time, never alongside a task it could conflict with. A
 * failed task is retried up to `maxRetries` times when retrying can help; tasks
 * that depend on a failure are skipped rather than run on a broken base.
 */
export async function runTaskGraph<R extends {status: AgentStatus}>(
	tasks: PlannedTask[],
	run: (task: PlannedTask, attempt: number) => Promise<R>,
	options: GraphOptions,
	onChange?: (id: string, state: TaskState) => void,
): Promise<TaskOutcome<R>[]> {
	const state = new Map<string, TaskState>(tasks.map(t => [t.id, 'pending']));
	const attempts = new Map<string, number>();
	const outcomes = new Map<string, TaskOutcome<R>>();
	const overlapped = new Set<string>();
	const running = new Map<string, Promise<void>>();
	const set = (id: string, next: TaskState) => {
		state.set(id, next);
		onChange?.(id, next);
	};
	let abortError: unknown;

	const settle = (task: PlannedTask, result: R | undefined, error?: unknown) => {
		const tries = attempts.get(task.id)!;
		if (result?.status === 'success') {
			outcomes.set(task.id, {id: task.id, state: 'success', attempts: tries, result, overlapped: overlapped.has(task.id)});
			return set(task.id, 'success');
		}
		const retryable = result ? RETRYABLE.includes(result.status) : false;
		if (retryable && tries <= options.maxRetries && !options.signal.aborted) return set(task.id, 'pending');
		const reason = error instanceof Error ? error.message : undefined;
		outcomes.set(task.id, {id: task.id, state: 'failed', attempts: tries, result, reason, overlapped: overlapped.has(task.id)});
		set(task.id, 'failed');
	};

	const start = (task: PlannedTask) => {
		const attempt = (attempts.get(task.id) ?? 0) + 1;
		attempts.set(task.id, attempt);
		if (running.size > 0) {
			overlapped.add(task.id);
			for (const id of running.keys()) overlapped.add(id);
		}
		set(task.id, 'running');
		const promise = run(task, attempt).then(
			result => settle(task, result),
			error => {
				if (error instanceof AbortError || options.signal.aborted) abortError = error;
				settle(task, undefined, error);
			},
		);
		running.set(task.id, promise.finally(() => running.delete(task.id)));
	};

	for (;;) {
		// Anything waiting on a failure can never run.
		let skipped = true;
		while (skipped) {
			skipped = false;
			for (const task of tasks) {
				if (state.get(task.id) !== 'pending') continue;
				const broken = task.deps.find(d => state.get(d) === 'failed' || state.get(d) === 'skipped');
				if (broken) {
					outcomes.set(task.id, {id: task.id, state: 'skipped', attempts: 0, reason: `depends on "${broken}", which did not succeed`, overlapped: false});
					set(task.id, 'skipped');
					skipped = true;
				}
			}
		}

		if (!options.signal.aborted && !abortError) {
			for (const task of tasks) {
				if (running.size >= options.maxParallel) break;
				if (state.get(task.id) !== 'pending') continue;
				if (!task.deps.every(d => state.get(d) === 'success')) continue;
				const busy = tasks.filter(t => running.has(t.id));
				if (!busy.every(other => canRunTogether(task, other))) continue;
				start(task);
			}
		}

		if (running.size === 0) break;
		await Promise.race(running.values());
	}

	if (abortError || options.signal.aborted) throw abortError instanceof AbortError ? abortError : new AbortError();
	return tasks.map(t => outcomes.get(t.id) ?? {id: t.id, state: 'skipped', attempts: 0, reason: 'never started', overlapped: false});
}
