import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Runs a scripted scenario of scripts/ui-smoke.mjs and returns the named frames. */
function scenario(name, env = {}) {
	const out = execFileSync(process.execPath, ['scripts/ui-smoke.mjs', '100', name], {encoding: 'utf8', env: {...process.env, OPENROUTER_API_KEY: '', ...env}});
	const frames = {};
	for (const block of out.split('\n===== ').slice(1)) {
		const newline = block.indexOf('\n');
		frames[block.slice(0, newline)] = block.slice(newline + 1);
	}
	return frames;
}

test('ask panel: recommended option, free text, answers reach the model, todos render', () => {
	const f = scenario('agent');
	assert.match(f['ask q1'], /1\/2 Which framework\?/);
	assert.match(f['ask q1'], /❯ 2\. Vue \(recommended\)/);
	assert.match(f['ask q1'], /No framework in package\.json yet\./);
	assert.match(f['ask q1'], /Waiting for your answer/);
	assert.match(f['ask q2'], /2\/2 Project name\?/);
	assert.match(f['after answers'], /A: Vue \| {2}\| Q: Project name\? \| A: demo/);
	assert.match(f['after answers'], /Todos 1\/3/);
	assert.match(f['after answers'], /▶ Add router/);
	assert.match(f['after answers'], /Todos\(3 tasks\)/);
	assert.doesNotMatch(f['after answers'], /Which framework\?\n.*1\. React/, 'panel closes after answering');
});

test('esc skips the questions without interrupting the turn', () => {
	const f = scenario('agent-skip');
	assert.match(f['skipped'], /Skipped by user/);
	assert.match(f['skipped'], /Got: no answers/);
	assert.doesNotMatch(f['skipped'], /Interrupted/);
});

test('marketplace: install hello world, run /helloworld, uninstall', () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'toolcode-ui-mp-'));
	try {
		const f = scenario('marketplace', {TOOLCODE_PLUGIN_DIR: dir});
		assert.match(f['marketplace'], /❯ Hello World +command +install/);
		assert.match(f['installed'], /✓ installed/);
		assert.match(f['installed'], /Installed Hello World: try \/helloworld\./);
		assert.match(f['menu'], /\/helloworld +Reply with hello world/);
		assert.match(f['hello'], /> \/helloworld\n\n ● hello world/);
		assert.match(f['uninstalled'], /Uninstalled Hello World\./);
		assert.match(f['after uninstall'], /Unknown command \/helloworld/);
	} finally {
		rmSync(dir, {recursive: true, force: true});
	}
});
