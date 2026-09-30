import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changedFiles} from '../dist/ui/activity.js';
import {highlightLine} from '../dist/ui/highlight.js';
import {allocateSidebar, computeLayout, windowStart} from '../dist/ui/layout.js';
import {parseMouse} from '../dist/ui/mouse.js';
import {isFree, MODEL_SORTS, selectModels} from '../dist/ui/models.js';

const sum = heights => Object.values(heights).reduce((a, b) => a + b, 0);

/** Minimal stand-in for a Provider; the picker logic only reads id, name and models. */
const fakeProvider = (id, name, models) => ({id, name, models});

test('model search matches label, id and provider, and narrows with extra terms', () => {
	const providers = [
		fakeProvider('openrouter', 'OpenRouter', [
			{id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5'},
			{id: 'z-ai/glm-4.6:free', label: 'GLM 4.6'},
		]),
		fakeProvider('ollama', 'Ollama', [{id: 'llama3', label: 'Llama 3'}]),
	];
	const all = selectModels(providers, {query: '', sort: 'provider', freeOnly: false});
	assert.equal(all.length, 3);

	// A bare term searches the label, the raw id and the provider name.
	assert.equal(selectModels(providers, {query: 'sonnet', sort: 'provider', freeOnly: false}).length, 1);
	assert.equal(selectModels(providers, {query: 'anthropic/', sort: 'provider', freeOnly: false}).length, 1);
	assert.equal(selectModels(providers, {query: 'ollama', sort: 'provider', freeOnly: false}).length, 1);

	// Terms combine with AND, so a second word filters the first one's results down.
	const two = selectModels(providers, {query: 'llama ollama', sort: 'provider', freeOnly: false});
	assert.equal(two.length, 1);
	assert.equal(selectModels(providers, {query: 'sonnet ollama', sort: 'provider', freeOnly: false}).length, 0);
	assert.equal(selectModels(providers, {query: 'nope', sort: 'provider', freeOnly: false}).length, 0);
});

test('the free filter keeps only free models, by flag or by :free id', () => {
	const providers = [
		fakeProvider('openrouter', 'OpenRouter', [
			{id: 'paid/one', label: 'Paid One'},
			{id: 'flagged/two', label: 'Flagged Two', free: true},
			{id: 'vendor/three:free', label: 'Three'},
		]),
	];
	const free = selectModels(providers, {query: '', sort: 'provider', freeOnly: true});
	assert.deepEqual(free.map(e => e.model.id), ['flagged/two', 'vendor/three:free']);
	// A paid model with a false-ish free flag must not sneak through.
	assert.equal(isFree({id: 'x/y', label: 'Y', free: false}), false);
});

test('sorting groups by provider, orders by name, and floats free models first', () => {
	const providers = [
		fakeProvider('zeta', 'Zeta', [{id: 'z/1', label: 'Alpha'}]),
		fakeProvider('alpha', 'Alpha', [{id: 'a/1', label: 'Zulu'}, {id: 'a/2', label: 'Bravo', free: true}]),
	];
	const by = sort => selectModels(providers, {query: '', sort, freeOnly: false}).map(e => `${e.provider.name}/${e.model.label}`);
	assert.deepEqual(by('provider'), ['Alpha/Bravo', 'Alpha/Zulu', 'Zeta/Alpha']);
	assert.deepEqual(by('name'), ['Zeta/Alpha', 'Alpha/Bravo', 'Alpha/Zulu']);
	// "free first" keeps provider grouping within each band.
	assert.deepEqual(by('free'), ['Alpha/Bravo', 'Alpha/Zulu', 'Zeta/Alpha']);
	assert.deepEqual(MODEL_SORTS, ['provider', 'name', 'free']);
});

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
