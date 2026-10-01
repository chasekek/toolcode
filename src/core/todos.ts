/**
 * The agent's task list. Only todo/doing/done is stored; "blocked" and
 * "ready" are derived from dependencies, so finishing a task unblocks the
 * tasks after it without any extra bookkeeping.
 */
export type TodoStatus = 'todo' | 'doing' | 'done';

export interface Todo {
	id: string;
	text: string;
	status: TodoStatus;
	/** Ids of tasks that must be done first. */
	deps: string[];
}

export type Phase = 'blocked' | 'ready' | 'doing' | 'done';

const MAX_TODOS = 50;
const STATUSES: TodoStatus[] = ['todo', 'doing', 'done'];

/** Dependencies of a task that are not done yet. */
export function waitingOn(todo: Todo, all: Todo[]): string[] {
	return todo.deps.filter(dep => all.find(t => t.id === dep)?.status !== 'done');
}

export function phaseOf(todo: Todo, all: Todo[]): Phase {
	if (todo.status !== 'todo') return todo.status;
	return waitingOn(todo, all).length > 0 ? 'blocked' : 'ready';
}

/** Validates a list sent by the model; throws with a message the model can act on. */
export function parseTodos(value: unknown): Todo[] {
	if (!Array.isArray(value)) throw new Error('"todos" must be an array.');
	if (value.length > MAX_TODOS) throw new Error(`At most ${MAX_TODOS} todos.`);

	const todos = value.map((raw, i): Todo => {
		const item = (raw ?? {}) as Record<string, unknown>;
		const id = typeof item['id'] === 'number' ? String(item['id']) : item['id'];
		if (typeof id !== 'string' || !id.trim()) throw new Error(`Todo #${i + 1} needs an "id".`);
		if (typeof item['text'] !== 'string' || !item['text'].trim()) throw new Error(`Todo "${id}" needs "text".`);
		const status = item['status'] ?? 'todo';
		if (!STATUSES.includes(status as TodoStatus)) throw new Error(`Todo "${id}" has status "${String(status)}"; use todo, doing or done.`);
		const deps = item['deps'] ?? [];
		if (!Array.isArray(deps)) throw new Error(`Todo "${id}": "deps" must be an array of ids.`);
		return {id: id.trim(), text: item['text'].trim(), status: status as TodoStatus, deps: deps.map(String)};
	});

	const ids = new Set<string>();
	for (const todo of todos) {
		if (ids.has(todo.id)) throw new Error(`Duplicate todo id "${todo.id}".`);
		ids.add(todo.id);
	}
	for (const todo of todos) {
		for (const dep of todo.deps) {
			if (!ids.has(dep)) throw new Error(`Todo "${todo.id}" depends on unknown id "${dep}".`);
		}
	}
	const cycle = findCycle(todos);
	if (cycle) throw new Error(`Dependency cycle: ${cycle.join(' -> ')}.`);
	for (const todo of todos) {
		const waiting = waitingOn(todo, todos);
		if (todo.status !== 'todo' && waiting.length > 0) {
			throw new Error(`Todo "${todo.id}" is ${todo.status} but still waits on ${waiting.join(', ')}.`);
		}
	}
	return todos;
}

/** A dependency cycle as a path of ids, or null. Shared with orchestrator task plans. */
export function findCycle(todos: Array<{id: string; deps: string[]}>): string[] | null {
	const byId = new Map(todos.map(t => [t.id, t]));
	const state = new Map<string, 'visiting' | 'done'>();
	const path: string[] = [];
	const visit = (id: string): string[] | null => {
		if (state.get(id) === 'done') return null;
		if (state.get(id) === 'visiting') return [...path.slice(path.indexOf(id)), id];
		state.set(id, 'visiting');
		path.push(id);
		for (const dep of byId.get(id)!.deps) {
			const cycle = visit(dep);
			if (cycle) return cycle;
		}
		path.pop();
		state.set(id, 'done');
		return null;
	};
	for (const todo of todos) {
		const cycle = visit(todo.id);
		if (cycle) return cycle;
	}
	return null;
}

/** Tasks that were blocked in `before` and are ready in `after`. */
export function newlyReady(before: Todo[], after: Todo[]): Todo[] {
	return after.filter(t => {
		const old = before.find(b => b.id === t.id);
		return old && phaseOf(old, before) === 'blocked' && phaseOf(t, after) === 'ready';
	});
}

/** Plain-text view of the list, sent back to the model. */
export function formatTodos(todos: Todo[]): string {
	if (todos.length === 0) return '(no todos)';
	return todos
		.map(t => {
			const phase = phaseOf(t, todos);
			const waiting = phase === 'blocked' ? ` (waiting on ${waitingOn(t, todos).join(', ')})` : '';
			return `[${phase}] ${t.id}. ${t.text}${waiting}`;
		})
		.join('\n');
}
