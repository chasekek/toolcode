import React from 'react';
import {EventEmitter} from 'node:events';
import {render} from 'ink';
import {App} from '../dist/ui/App.js';
import {loadPlugins} from '../dist/plugins/loader.js';

const width = Number(process.argv[2] ?? 90);
const scenario = process.argv[3] ?? 'main';
const wait = (ms = 80) => new Promise(r => setTimeout(r, ms));
class Out extends EventEmitter {
	columns = width; rows = 50; frame = ''; isTTY = true;
	write(s) { if (!s.startsWith('\x1b[2J')) this.frame = s; return true; }
}
class In extends EventEmitter {
	isTTY = true; data = [];
	setRawMode() {} setEncoding() {} ref() {} unref() {} resume() {} pause() {}
	read() { return this.data.shift() ?? null; }
	write(s) { this.data.push(s); this.emit('readable'); }
}
const stdout = new Out(), stdin = new In();
const pluginPaths = {plugins: ['plugins', 'missing-plugin.js'], agent: ['test/fixtures/scripted-provider.mjs'], 'agent-skip': ['test/fixtures/scripted-provider.mjs']}[scenario];
const plugins = pluginPaths ? await loadPlugins(pluginPaths, {builtinDir: false}) : undefined;
const settings = {unicode: scenario !== 'ascii', expandTools: false, simulateErrors: scenario === 'error'};
const app = render(React.createElement(App, {initialSettings: settings, plugins}), {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
const type = async s => { for (const c of s) { stdin.write(c); await wait(10); } await wait(); };
const key = async (k, ms = 80) => { stdin.write(k); await wait(ms); };
const show = t => console.log(`\n===== ${t}\n` + stdout.frame);
await wait();

if (scenario === 'plugins') {
	await type('/plugins'); await key('\r'); show('plugins');
	await type('/model'); await key('\r'); show('picker');
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
	await type('/marketplace'); await key('\r'); show('marketplace');
	await key('\r', 400); show('installed');
	await key('\x1b'); await type('/hel'); show('menu');
	await type('loworld'); await key('\r', 200); show('hello');
	await type('/marketplace'); await key('\r'); await key('\r', 300); show('uninstalled');
	await key('\x1b'); await type('/helloworld'); await key('\r', 200); show('after uninstall');
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
} else {
	await type('do it'); await key('\r', 4000); show('after run');
	await type('/retry'); await key('\r', 300); show('retrying');
}
app.unmount();
process.exit(0);
