import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changedFiles} from '../dist/ui/activity.js';
import {highlightLine} from '../dist/ui/highlight.js';
import {allocateSidebar, computeLayout, windowStart} from '../dist/ui/layout.js';
import {parseMouse} from '../dist/ui/mouse.js';

const sum = heights => Object.values(heights).reduce((a, b) => a + b, 0);

test('the sidebar always fills its column, serving the focused panel first', () => {
	for (const available of [4, 9, 12, 17, 30, 60]) {
		for (const focus of ['prompt', 'todos', 'files', 'tools']) {
			const {heights} = allocateSidebar(available, {todos: 5, files: 3, tools: 20}, focus);
			assert.equal(sum(heights), available, `${available} rows, focus ${focus}`);
		}
	}
	const focused = allocateSidebar(30, {todos: 1, files: 12, tools: 20}, 'files').heights;
	assert.equal(focused.files, 14, 'the focused list gets all of its rows');
});

test('short sidebars compact the session panel, then drop Files before the rest', () => {
	const tall = allocateSidebar(30, {todos: 1, files: 1, tools: 1}, 'prompt');
	assert.equal(tall.compactSession, false);
	const short = allocateSidebar(10, {todos: 1, files: 1, tools: 1}, 'prompt');
	assert.equal(short.compactSession, true);
	assert.equal(short.heights.files, undefined);
	assert.ok(short.heights.todos && short.heights.tools);
	// ...unless Files has focus, in which case another panel goes instead.
	const focused = allocateSidebar(10, {todos: 1, files: 1, tools: 1}, 'files');
	assert.ok(focused.heights.files);
});

test('the frame leaves the last row free and narrow terminals lose the sidebar', () => {
	const wide = computeLayout({columns: 120, rows: 40, promptLines: 1, wants: {todos: 1, files: 1, tools: 1}, openTodos: 2, focus: 'prompt'});
	assert.equal(wide.height, 39, 'a full-height frame makes Ink repaint the whole screen');
	assert.equal(wide.main.height + wide.prompt.height + wide.keybar.height, wide.height);
	assert.equal(wide.todoStrip, null);
	assert.equal(wide.sidebar.reduce((total, p) => total + p.height, 0), wide.main.height);

	const narrow = computeLayout({columns: 70, rows: 24, promptLines: 3, wants: {todos: 1, files: 1, tools: 1}, openTodos: 2, focus: 'prompt'});
	assert.equal(narrow.sidebar.length, 0);
	assert.equal(narrow.main.width, 70);
	assert.equal(narrow.todoStrip?.height, 4, 'open todos move above the prompt');
	assert.equal(narrow.prompt.height, 5);
	assert.equal(computeLayout({columns: 39, rows: 30, promptLines: 1, wants: {todos: 1, files: 1, tools: 1}, openTodos: 0, focus: 'prompt'}).tooSmall, true);
});

test('list windows scroll only as far as needed to show the selection', () => {
	assert.equal(windowStart(3, 5, 2), 0, 'everything fits');
	assert.equal(windowStart(20, 5, 7, 0), 3, 'moving down past the end scrolls by the difference');
	assert.equal(windowStart(20, 5, 5, 3), 3, 'a visible selection keeps the window where it was');
	assert.equal(windowStart(20, 5, 1, 3), 1, 'moving above the window scrolls up to it');
	assert.equal(windowStart(20, 5, 19, 99), 15, 'the window never runs past the end');
});

const call = (name, args, summary, status = 'success') => ({id: `${name}:${args}:${summary}`, name, args, status, summary});
const transcript = calls => [{id: 'a', role: 'assistant', status: 'done', model: 'm', parts: calls.map(c => ({type: 'tool', call: c}))}];

test('changed files: git-style status letters and net line counts', () => {
	const files = changedFiles(
		transcript([
			call('Write', 'src/app.ts', 'Created file (10 lines)'),
			call('Write', './src/app.ts', 'Edited file (12 lines, +2)'),
			call('Write', 'README.md', 'Edited file (4 lines, -1)'),
			call('Delete', 'old.js', 'Deleted file'),
			call('Write', 'tmp.txt', 'Created file (1 line)'),
			call('Delete', 'tmp.txt', 'Deleted file'),
			call('Write', 'broken.ts', 'Permission denied', 'error'),
			call('Read', 'notes.md', 'Read 3 lines'),
		]),
	);
	assert.deepEqual(
		files.map(f => [f.status, f.path, f.delta]),
		[
			['A', 'src/app.ts', 12],
			['M', 'README.md', -1],
			['D', 'old.js', null],
		],
	);
});

test('mouse reports: wheel, clicks and modifiers', () => {
	assert.deepEqual(parseMouse('[<64;10;5M'), {kind: 'wheelUp', button: 0, x: 9, y: 4});
	assert.deepEqual(parseMouse('[<65;1;1M'), {kind: 'wheelDown', button: 0, x: 0, y: 0});
	assert.deepEqual(parseMouse('[<0;3;7M'), {kind: 'press', button: 0, x: 2, y: 6});
	assert.deepEqual(parseMouse('[<0;3;7m'), {kind: 'release', button: 0, x: 2, y: 6});
	assert.equal(parseMouse('[<80;3;7M')?.kind, 'wheelUp', 'ctrl+wheel is still the wheel');
	assert.equal(parseMouse('hello'), null);
});

test('highlighting carries block comments across lines and leaves strings alone', () => {
	const state = {inBlockComment: false};
	assert.deepEqual(highlightLine('const a = "if"; /* start', 'ts', state).map(t => t.kind), [
		'keyword',
		'plain',
		'string',
		'plain',
		'comment',
	]);
	assert.equal(state.inBlockComment, true);
	assert.deepEqual(highlightLine('still */ return 1', 'ts', state).map(t => [t.kind, t.text]), [
		['comment', 'still */'],
		['plain', ' '],
		['keyword', 'return'],
		['plain', ' '],
		['number', '1'],
	]);
	assert.equal(state.inBlockComment, false);
	assert.deepEqual(highlightLine('x = 1', undefined), [{text: 'x = 1', kind: 'plain'}]);
});
