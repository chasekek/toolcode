import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {tempDir, scriptedProvider, runTurn} from './helpers.mjs';

test('read, write, delete round trip with UI summaries', async () => {
	const {dir, cleanup} = tempDir();
	try {
		writeFileSync(path.join(dir, 'a.txt'), 'one\n');
		const {provider} = scriptedProvider([
			[{name: 'read_file', args: {path: 'a.txt'}}],
			[{name: 'write_file', args: {path: 'a.txt', content: 'one\ntwo\n'}}, {name: 'write_file', args: {path: 'src/b.js', content: 'x\n'}}],
			[{name: 'delete_file', args: {path: 'a.txt'}}],
			'All done.',
		]);
		const {toolEnds, history} = await runTurn({provider, cwd: dir});
		assert.deepEqual(toolEnds.map(e => e.summary), ['Read 1 line', 'Edited file (2 lines, +1)', 'Created file (1 line)', 'Deleted file']);
		assert.equal(readFileSync(path.join(dir, 'src/b.js'), 'utf8'), 'x\n');
		assert.equal(existsSync(path.join(dir, 'a.txt')), false);
		assert.equal(history.at(-1).content, 'All done.');
	} finally {
		cleanup();
	}
});

test('paths outside the workspace and bad arguments are errors, not crashes', async () => {
	const {dir, cleanup} = tempDir();
	try {
		const {provider} = scriptedProvider([[{name: 'read_file', args: {path: '../x'}}, {name: 'nope_tool'}], 'ok']);
		const {toolEnds, history} = await runTurn({provider, cwd: dir});
		assert.deepEqual(toolEnds.map(e => e.status), ['error', 'error']);
		assert.match(toolEnds[0].summary, /outside the workspace/);
		// Every tool call got a result, so the history stays valid for the next request.
		assert.equal(history.filter(m => m.role === 'tool').length, 2);
	} finally {
		cleanup();
	}
});

test('plan turns only offer read-only tools', async () => {
	const {dir, cleanup} = tempDir();
	try {
		const {provider, requests} = scriptedProvider([[{name: 'write_file', args: {path: 'a', content: ''}}], 'plan']);
		const {toolEnds} = await runTurn({provider, cwd: dir, kind: 'plan'});
		assert.ok(!requests[0].tools.some(t => t.name === 'write_file'));
		assert.equal(toolEnds[0].status, 'error');
		assert.equal(existsSync(path.join(dir, 'a')), false);
	} finally {
		cleanup();
	}
});
