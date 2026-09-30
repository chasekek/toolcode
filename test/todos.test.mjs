import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatTodos, newlyReady, parseTodos, phaseOf} from '../dist/core/todos.js';
import {tempDir, scriptedProvider, runTurn} from './helpers.mjs';

const list = (...items) => parseTodos(items);

test('blocked and ready are derived from deps', () => {
	const todos = list({id: '1', text: 'a', status: 'done'}, {id: '2', text: 'b', deps: ['1']}, {id: '3', text: 'c', deps: ['2']});
	assert.deepEqual(todos.map(t => phaseOf(t, todos)), ['done', 'ready', 'blocked']);
	assert.match(formatTodos(todos), /\[blocked\] 3\. c \(waiting on 2\)/);
});

test('finishing a task reports what it unblocked', () => {
	const before = list({id: '1', text: 'a', status: 'doing'}, {id: '2', text: 'b', deps: ['1']}, {id: '3', text: 'c'});
	const after = list({id: '1', text: 'a', status: 'done'}, {id: '2', text: 'b', deps: ['1']}, {id: '3', text: 'c'});
	assert.deepEqual(newlyReady(before, after).map(t => t.id), ['2']);
});

test('invalid lists are rejected with actionable messages', () => {
	assert.throws(() => list({id: '1', text: 'a'}, {id: '1', text: 'b'}), /Duplicate todo id "1"/);
	assert.throws(() => list({id: '1', text: 'a', deps: ['9']}), /unknown id "9"/);
	assert.throws(() => list({id: '1', text: 'a', deps: ['2']}, {id: '2', text: 'b', deps: ['1']}), /cycle: 1 -> 2 -> 1/);
	assert.throws(() => list({id: '1', text: 'a'}, {id: '2', text: 'b', status: 'doing', deps: ['1']}), /is doing but still waits on 1/);
	assert.throws(() => list({id: '1', text: 'a', status: 'started'}), /use todo, doing or done/);
	assert.equal(list({id: 7, text: 'numeric ids are fine'})[0].id, '7');
});

test('todo_write keeps its list across turns and works in plan mode', async () => {
	const {dir, cleanup} = tempDir();
	try {
		const session = {todos: []};
		const first = scriptedProvider([[{name: 'todo_write', args: {todos: [{id: '1', text: 'read'}, {id: '2', text: 'edit', deps: ['1']}]}}], 'planned']);
		const {toolEnds} = await runTurn({provider: first.provider, cwd: dir, kind: 'plan', session});
		assert.equal(toolEnds[0].summary, '0/2 done');
		assert.equal(session.todos.length, 2);

		const second = scriptedProvider([[{name: 'todo_write', args: {todos: [{id: '1', text: 'read', status: 'done'}, {id: '2', text: 'edit', deps: ['1']}]}}], 'ok']);
		const {toolEnds: ends, history} = await runTurn({provider: second.provider, cwd: dir, session});
		assert.equal(ends[0].summary, '1/2 done · unblocked 2');
		assert.match(history.find(m => m.role === 'tool').content, /Now unblocked: 2/);
	} finally {
		cleanup();
	}
});

test('a rejected list leaves the previous one in place', async () => {
	const {dir, cleanup} = tempDir();
	try {
		const session = {todos: parseTodos([{id: '1', text: 'keep me'}])};
		const {provider} = scriptedProvider([[{name: 'todo_write', args: {todos: [{id: '1', text: 'x', deps: ['1']}]}}], 'ok']);
		const {toolEnds} = await runTurn({provider, cwd: dir, session});
		assert.equal(toolEnds[0].status, 'error');
		assert.equal(session.todos[0].text, 'keep me');
	} finally {
		cleanup();
	}
});
