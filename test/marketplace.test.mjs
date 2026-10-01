import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, existsSync, mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The plugin folder is read at import time, so point it at a temp dir first.
const dir = mkdtempSync(path.join(os.tmpdir(), 'toolcode-mp-'));
process.env.TOOLCODE_PLUGIN_DIR = dir;
const {readCatalog, install, uninstall, isInstalled, installPath, catalogPath, catalogState} = await import('../dist/plugins/marketplace.js');
const {getCommand, matchCommands} = await import('../dist/core/commands.js');
const {getProvider} = await import('../dist/providers/registry.js');
test.after(() => rmSync(dir, {recursive: true, force: true}));

const entry = id => readCatalog().find(e => e.id === id);

test('catalog lists the bundled plugins and every file exists', () => {
	const catalog = readCatalog();
	assert.ok(catalog.some(e => e.id === 'hello-world'));
	for (const e of catalog) assert.ok(existsSync(path.join('plugins', e.file)), `${e.id} -> ${e.file}`);
});

test('installing hello-world adds /helloworld live; uninstalling removes it', async () => {
	const hello = entry('hello-world');
	const loaded = await install(hello);
	assert.ok(isInstalled(hello));
	assert.equal(installPath(hello), path.join(dir, 'hello-world.mjs'));
	assert.equal(await getCommand('/helloworld').run('', {cwd: '.'}), 'hello world');
	assert.ok(matchCommands('/hello').some(c => c.name === '/helloworld'));
	await assert.rejects(install(hello), /already installed/);
	assert.ok(isInstalled(hello), 'a refused reinstall keeps the existing file');

	uninstall(hello, loaded);
	assert.equal(isInstalled(hello), false);
	assert.equal(getCommand('/helloworld'), undefined);
	assert.deepEqual((await install(hello)).commands, ['/helloworld'], 'installs again after uninstall');
});

test('provider plugins register and unregister too', async () => {
	const echo = entry('echo');
	const loaded = await install(echo);
	assert.ok(getProvider('echo'));
	uninstall(echo, loaded);
	assert.equal(getProvider('echo'), undefined);
});

test('catalogState counts a plugin loaded from the bundled copy, not the plugins folder', () => {
	const ollama = entry('ollama');
	assert.equal(catalogState(ollama, []), 'available');
	// What `loadPlugins` returns for `--plugin plugins`: a file sitting next to the catalog.
	const fromSource = [{name: 'ollama', file: catalogPath(ollama), tools: [], providers: [], commands: []}];
	assert.equal(catalogState(ollama, fromSource), 'loaded');
	// An installed file wins, and is what makes the entry removable.
	copyFileSync(catalogPath(ollama), installPath(ollama));
	try {
		assert.equal(catalogState(ollama, []), 'installed');
		assert.equal(catalogState(ollama, fromSource), 'installed');
	} finally {
		rmSync(installPath(ollama), {force: true});
	}
	assert.equal(catalogState(ollama, fromSource), 'loaded');
});
