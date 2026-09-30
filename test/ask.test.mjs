import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tempDir, scriptedProvider, runTurn} from './helpers.mjs';

const question = {question: 'Which framework?', options: ['React', 'Vue'], recommended: 'Vue', context: 'package.json has none yet'};

test('answers go back to the model as Q/A pairs', async () => {
	const {dir, cleanup} = tempDir();
	try {
		let asked;
		const {provider} = scriptedProvider([[{name: 'ask', args: {questions: [question, {question: 'Name?'}]}}], 'ok']);
		const {toolEnds, history} = await runTurn({provider, cwd: dir, ask: async qs => ((asked = qs), ['Vue', 'demo-app'])});
		assert.equal(asked[0].recommended, 'Vue');
		assert.deepEqual(asked[1].options, []);
		assert.equal(toolEnds[0].summary, 'Answered 2 questions');
		assert.match(history.find(m => m.role === 'tool').content, /Q: Which framework\?\nA: Vue\n\nQ: Name\?\nA: demo-app/);
	} finally {
		cleanup();
	}
});

test('skipping, a missing UI and bad input are all handled', async () => {
	const {dir, cleanup} = tempDir();
	try {
		const skipped = scriptedProvider([[{name: 'ask', args: {questions: [question]}}], 'ok']);
		const r1 = await runTurn({provider: skipped.provider, cwd: dir, ask: async () => null});
		assert.equal(r1.toolEnds[0].summary, 'Skipped by user');

		const noUi = scriptedProvider([[{name: 'ask', args: {questions: [question]}}], 'ok']);
		const r2 = await runTurn({provider: noUi.provider, cwd: dir});
		assert.equal(r2.toolEnds[0].status, 'error');
		assert.match(r2.toolEnds[0].summary, /not available/);

		const bad = scriptedProvider([[{name: 'ask', args: {questions: []}}, {name: 'ask', args: {questions: [{question: 'q', recommended: 'nope', options: ['a']}]}}], 'ok']);
		let seen;
		const r3 = await runTurn({provider: bad.provider, cwd: dir, ask: async qs => ((seen = qs), ['a'])});
		assert.equal(r3.toolEnds[0].status, 'error');
		assert.equal(seen[0].recommended, undefined, 'a recommendation that matches no option is dropped');
	} finally {
		cleanup();
	}
});

test('ask and todo_write are offered in read-only turns', async () => {
	const {dir, cleanup} = tempDir();
	try {
		const {provider, requests} = scriptedProvider(['ok']);
		await runTurn({provider, cwd: dir, kind: 'plan'});
		assert.deepEqual(requests[0].tools.map(t => t.name).sort(), ['ask', 'read_file', 'search', 'todo_write']);
	} finally {
		cleanup();
	}
});
