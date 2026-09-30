import {formatTodos, newlyReady, parseTodos, phaseOf} from '../core/todos.js';
import type {Tool} from './types.js';

export const todoWrite: Tool = {
	name: 'todo_write',
	label: 'Todos',
	description:
		'Replace your task list with an updated one. Use it for work with 3 or more steps: write the steps up front, ' +
		'mark the one you are working on "doing", and mark each "done" as soon as it is finished. Use "deps" for steps ' +
		'that must wait for others; they unblock automatically when their dependencies are done. Always send the full list.',
	parameters: {
		type: 'object',
		properties: {
			todos: {
				type: 'array',
				description: 'The complete task list, in order.',
				items: {
					type: 'object',
					properties: {
						id: {type: 'string', description: 'Short unique id, e.g. "1".'},
						text: {type: 'string', description: 'What needs to be done.'},
						status: {type: 'string', enum: ['todo', 'doing', 'done'], description: 'Defaults to "todo".'},
						deps: {type: 'array', items: {type: 'string'}, description: 'Ids that must be done before this one.'},
					},
					required: ['id', 'text'],
				},
			},
		},
		required: ['todos'],
		additionalProperties: false,
	},
	// Touches no files, so it also works while planning.
	readOnly: true,
	describe: args => (Array.isArray(args['todos']) ? `${args['todos'].length} tasks` : ''),
	async run(args, ctx) {
		const todos = parseTodos(args['todos']);
		const unblocked = newlyReady(ctx.session.todos, todos);
		ctx.session.todos = todos;

		const done = todos.filter(t => t.status === 'done').length;
		const ready = todos.filter(t => phaseOf(t, todos) === 'ready');
		const lines = [formatTodos(todos)];
		if (unblocked.length > 0) lines.push(`Now unblocked: ${unblocked.map(t => t.id).join(', ')}.`);
		if (done === todos.length && todos.length > 0) lines.push('All tasks are done.');
		else if (!todos.some(t => t.status === 'doing') && ready.length > 0) lines.push(`Next ready: ${ready[0]!.id}. ${ready[0]!.text}`);

		return {
			status: 'success',
			summary: `${done}/${todos.length} done${unblocked.length > 0 ? ` · unblocked ${unblocked.map(t => t.id).join(', ')}` : ''}`,
			output: formatTodos(todos),
			content: lines.join('\n'),
		};
	},
};
