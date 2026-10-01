import React from 'react';
import {EventEmitter} from 'node:events';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {render} from 'ink';
import {App} from '../dist/ui/App.js';
import {loadPlugins} from '../dist/plugins/loader.js';
// The app scrapes the OpenRouter catalog on mount; frames here must not depend on it.
process.env.TOOLCODE_NO_MODEL_SCRAPE ??= '1';
const width = Number(process.argv[2] ?? 90);
const scenario = process.argv[3] ?? 'main';
const height = Number(process.argv[4] ?? 40);
const wait = (ms = 80) => new Promise(r => setTimeout(r, ms));
class Out extends EventEmitter {
	columns = width; rows = height; frame = ''; isTTY = true;
	// Screen clears and terminal modes (mouse reporting) are not frames.
	write(s) { if (!s.startsWith('\x1b[2J') && !s.startsWith('\x1b[?')) this.frame = s; return true; }
}
class In extends EventEmitter {
	isTTY = true; data = [];
	setRawMode() {} setEncoding() {} ref() {} unref() {} resume() {} pause() {}
	read() { return this.data.shift() ?? null; }
	write(s) { this.data.push(s); this.emit('readable'); }
}
const stdout = new Out(), stdin = new In();
const workspace = ['panels', 'scroll', 'mouse', 'narrow'].includes(scenario);
const pluginPaths = {
	plugins: ['plugins', 'missing-plugin.js'],
	agent: ['test/fixtures/scripted-provider.mjs'],
	'agent-skip': ['test/fixtures/scripted-provider.mjs'],
	'marketplace-loaded': ['plugins'],
	...(workspace && {[scenario]: ['test/fixtures/workspace-provider.mjs']}),
}[scenario];
const plugins = pluginPaths ? await loadPlugins(pluginPaths.map(p => path.resolve(p)), {builtinDir: false}) : undefined;
// The workspace provider writes files: give it a scratch directory with a file to delete.
let scratch;
if (workspace) {
	scratch = mkdtempSync(path.join(os.tmpdir(), 'toolcode-smoke-'));
	writeFileSync(path.join(scratch, 'legacy.js'), 'module.exports = {};\n');
	process.chdir(scratch);
}
const settings = {unicode: scenario !== 'ascii', expandTools: false, simulateErrors: scenario === 'error'};
const app = render(React.createElement(App, {initialSettings: settings, plugins}), {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
const type = async s => { for (const c of s) { stdin.write(c); await wait(10); } await wait(); };
const key = async (k, ms = 80) => { stdin.write(k); await wait(ms); };
const show = t => console.log(`\n===== ${t}\n` + stdout.frame);
/** 0-based row of the first frame line containing `text`. */
const rowOf = text => stdout.frame.split('\n').findIndex(line => line.includes(text));
/** SGR mouse report for a 0-based cell. */
const mouse = (code, x, y, release = false) => `\x1b[<${code};${x + 1};${y + 1}${release ? 'm' : 'M'}`;
await wait();

if (scenario === 'plugins') {
	await type('/plugins'); await key('\r'); show('plugins');
	await type('/model'); await key('\r'); show('picker');
	await key('s'); show('picker sorted');
	await key('f'); show('picker free only');
	await key('/'); await type('echo'); show('picker search');
	await key('\x7f'); await key('\x1b', 200); show('picker search cleared');
	await key('\x1b', 200);
	await key('7'); show('picked echo');
	await type('hey'); await key('\r', 1500); show('echo reply');
} else if (scenario === 'agent') {
	await type('build it'); await key('\r', 300); show('ask q1');
	await key('\r'); show('ask q2');
	await type('demo'); await key('\r', 300); show('after answers');
} else if (scenario === 'agent-skip') {
	await type('build it'); await key('\r', 300);
	await key('\x1b', 300); show('skipped');
} else if (scenario === 'marketplace') {
	// The screen renders on its own, so every step waits long enough for the frame to
	// settle; shorter waits made this scenario race the install/uninstall.
	await type('/marketplace'); await key('\r', 400); show('marketplace');
	await key('\t', 300); show('filter tools');
	await key('3', 300); show('filter providers');
	await key('1', 300);
	await key('\r', 600); show('installed');
	await key('\x1b', 400); await type('/hel'); show('menu');
	await type('loworld'); await key('\r', 400); show('hello');
	await type('/marketplace'); await key('\r', 400); await key('\r', 600); show('uninstalled');
	await key('\x1b', 400); await type('/helloworld'); await key('\r', 400); show('after uninstall');
} else if (scenario === 'marketplace-loaded') {
	// Started with --plugin plugins: the catalog copies are already registered, so every
	// row must read "loaded" and pressing enter must explain itself instead of colliding.
	await type('/marketplace'); await key('\r', 400); show('marketplace');
	await key('\r', 600); show('install refused');
	await key('\t', 300); show('filter tools');
	await key('\x1b', 300); show('closed');
} else if (scenario === 'auth') {
	await type('/auth'); await key('\r'); show('auth list');
	await key('\r'); await type('sk-or-secret'); show('auth typing');
	await key('\r'); show('auth saved');
	// "/auth <provider>" opens straight into key entry; esc backs out to the list.
	await type('/auth openrouter'); await key('\r'); await key('\x1b'); await key('d'); show('auth removed');
	await key('\x1b'); await type('/auth nope'); await key('\r'); show('auth unknown');
} else if (scenario === 'orchestrate') {
	// Run with TOOLCODE_CONFIG_FILE pointing Claude Code at a missing path, so detection is deterministic.
	await type('/orchestrate'); await key('\r', 1500); show('orchestrator on');
	await type('/agents'); await key('\r', 1500); show('agents');
	await type('/orchestrate'); await key('\r', 300); show('orchestrator off');
} else if (scenario === 'main') {
	await type('/'); show('slash menu');
	await type('pl'); await key('\t'); show('tab complete /pl');
	for (let i = 0; i < 6; i++) await key('\x7f', 20);
	await type('line one\\'); await key('\r'); await type('line two'); show('multiline');
	await key('\r', 1300); show('streaming mid');
	await wait(3500); show('stream done');
	await key('\x0f'); show('ctrl+o expanded');
	await key('\x0f');
	await key('\x1b[A'); show('history up');
	await key('\x03');
	await type('second'); await key('\r', 900); await key('\x1b', 300); show('interrupted');
	await key('\x03'); show('ctrl+c once');
} else if (scenario === 'overlays') {
	await type('?'); show('shortcuts');
	await key('\x03');
	await key('\x1b[Z'); show('plan mode via shift+tab');
	await type('/config'); await key('\r'); show('config');
	await key('\x1b[B'); await key('\x1b[B'); await key(' '); show('config toggled unicode off');
	await key('\x1b[A'); await key('\x1b[A'); await key('\r'); show('model from config');
	await key('3'); show('back to config after pick');
	await key('\x1b'); await type('/judge'); await key('\r'); show('judge with nothing');
	await type('/help'); await key('\r'); show('help');
} else if (scenario === 'edge') {
	await type('héllo 🙂 日本語 ' + 'x'.repeat(120)); show('unicode + long line');
	await key('\x15'); await type('/model gpt-5'); await key('\r'); show('/model with arg');
	await type('stream'); await key('\r', 1500);
	stdout.columns = 40; stdout.emit('resize'); await wait(200); show('resized to 40 mid-stream');
	await type('more'); await key('\r'); show('enter while busy');
	stdout.columns = 120; stdout.emit('resize'); await wait(3500); show('resized to 120 done');
	await key('\x1b[Z'); await key('\x03'); await key('\x03', 200); console.log('\nexited cleanly after double ctrl+c');
} else if (scenario === 'ascii') {
	await type('hi'); await key('\r', 5000); show('ascii done');
} else if (scenario === 'panels') {
	// Tab from an empty prompt walks the panels; digits jump; the main panel follows the focus.
	await type('build a server'); await key('\r', 800); show('built');
	await key('\t'); show('focus chat');
	await key('\t'); show('focus session');
	await key('2'); show('focus todos');
	await key('3'); show('focus files');
	await key('j'); show('next file');
	await key('4'); show('focus tools');
	await key('k'); show('previous tool');
	await key('\x1b'); show('back to prompt');
} else if (scenario === 'scroll') {
	await type('build a server'); await key('\r', 800); show('pinned');
	await key('\x1b[5~'); show('page up');
	for (let i = 0; i < 8; i++) await key('\x1b[5~', 30);
	show('top');
	await key('\x1b[6~'); show('page down');
	for (let i = 0; i < 8; i++) await key('\x1b[6~', 30);
	show('bottom again');
} else if (scenario === 'mouse') {
	await type('build a server'); await key('\r', 800);
	// The first visible row of Files; unfocused, it shows the newest change (the deleted legacy.js).
	const files = rowOf('─Files');
	await key(mouse(0, 4, files + 1)); await key(mouse(0, 4, files + 1, true)); show('clicked file');
	await key(mouse(0, width - 10, 4)); show('clicked chat');
	await key(mouse(64, width - 10, 6)); await key(mouse(64, width - 10, 6)); show('wheel up');
	await key(mouse(0, 10, rowOf('─Prompt') + 1)); show('clicked prompt');
	await type('typed after click'); show('typing works');
} else if (scenario === 'narrow') {
	await type('build a server'); await key('\r', 800); show('narrow');
	stdout.columns = 40; stdout.emit('resize'); await wait(200); show('narrowest');
	stdout.rows = 11; stdout.emit('resize'); await wait(200); show('too small');
} else {
	await type('do it'); await key('\r', 4000); show('after run');
	await type('/retry'); await key('\r', 300); show('retrying');
}
app.unmount();
if (scratch) {
	process.chdir(os.tmpdir());
	rmSync(scratch, {recursive: true, force: true});
}
process.exit(0);
