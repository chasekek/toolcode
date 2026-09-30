import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {loadPlugins} from '../dist/plugins/loader.js';
import {getTool} from '../dist/tools/registry.js';
import {getProvider} from '../dist/providers/registry.js';
import {tempDir} from './helpers.mjs';

test('example plugins load from grouping folders', async () => {
	const report = await loadPlugins(['plugins'], {builtinDir: false});
	assert.deepEqual(report.errors, []);
	assert.ok(getTool('list_files'));
	assert.ok(getProvider('ollama') && getProvider('echo') && getProvider('llamacpp'));
});

test('broken plugins are reported and register nothing', async () => {
	const {dir, cleanup} = tempDir();
	try {
		writeFileSync(path.join(dir, 'clash.mjs'), "export default {tools: [{name: 'fresh_tool', description: 'x', run: () => ''}, {name: 'read_file', description: 'x', run: () => ''}]}");
		writeFileSync(path.join(dir, 'throws.mjs'), "throw new Error('boom')");
		const report = await loadPlugins([dir], {builtinDir: false});
		assert.equal(report.errors.length, 2);
		assert.equal(getTool('fresh_tool'), undefined);
	} finally {
		cleanup();
	}
});
