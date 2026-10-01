const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {fileReference, launchFor, toolcodeArgs} = require('../out/launch.js');

const defaults = {path: 'toolcode', ascii: false, mouse: true, orchestrator: false, plugins: [], loadUserPlugins: true};
const cwd = path.resolve('/work/project');

test('default settings pass no flags', () => {
	assert.deepEqual(toolcodeArgs(defaults, cwd), []);
});

test('settings map to TOOLCODE flags, plugin paths resolve against the workspace', () => {
	const args = toolcodeArgs({...defaults, ascii: true, mouse: false, orchestrator: true, loadUserPlugins: false, plugins: ['plugins', ' ', '/abs/p.js']}, cwd);
	assert.deepEqual(args, ['--ascii', '--no-mouse', '--orchestrator', '--no-plugins', '--plugin', path.join(cwd, 'plugins'), '--plugin', path.resolve('/abs/p.js')]);
});

test('a bare command runs directly, or through cmd.exe on Windows', () => {
	assert.deepEqual(launchFor(defaults, cwd, 'linux'), {shellPath: 'toolcode', shellArgs: []});
	assert.deepEqual(launchFor({...defaults, ascii: true}, cwd, 'win32'), {shellPath: 'cmd.exe', shellArgs: ['/d', '/c', 'toolcode', '--ascii']});
});

test('a script path runs under node on every platform', () => {
	for (const platform of ['linux', 'win32']) {
		assert.deepEqual(launchFor({...defaults, path: 'dist/cli.js'}, cwd, platform), {shellPath: 'node', shellArgs: [path.join(cwd, 'dist/cli.js')]});
	}
});

test('file references stay on one line and use forward slashes', () => {
	assert.equal(fileReference(path.join('src', 'app.ts')), 'src/app.ts ');
	assert.equal(fileReference('a.ts', 4), 'a.ts:4 ');
	assert.equal(fileReference('a.ts', 4, 4), 'a.ts:4 ');
	assert.equal(fileReference('a.ts', 4, 9), 'a.ts:4-9 ');
	assert.equal(fileReference('my file.ts', 1, 2), '"my file.ts":1-2 ');
});
