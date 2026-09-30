#!/usr/bin/env node
import {render} from 'ink';
import {loadPlugins, PLUGIN_DIR} from './plugins/loader.js';
import {App, type ExitSummary} from './ui/App.js';
import {captureConsole} from './ui/console.js';
import {MOUSE_OFF} from './ui/mouse.js';
import {detectUnicode} from './ui/theme.js';
import {APP_NAME, AUTHOR, VERSION} from './version.js';

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
	console.log(`${APP_NAME} v${VERSION} by ${AUTHOR}`);
	process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
	console.log(`${APP_NAME} v${VERSION} by ${AUTHOR}

Usage: toolcode [options]

Options:
  -v, --version        Print the version
  -h, --help           Show this help
      --ascii          Use plain ASCII symbols
      --mouse          Wheel scrolling and click to focus (the default)
      --no-mouse       Leave the mouse to the terminal, e.g. for selecting text
      --plugin <path>  Load a plugin file or folder (repeatable)
      --no-plugins     Skip plugins in ${PLUGIN_DIR}

Plugins in ${PLUGIN_DIR} load automatically.

Environment:
  OPENROUTER_API_KEY  API key for OpenRouter (or save one with /auth)`);
	process.exit(0);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
	console.error(`${APP_NAME} needs an interactive terminal.`);
	process.exit(1);
}

const pluginPaths = args.flatMap((arg, i) => (arg === '--plugin' && args[i + 1] ? [args[i + 1]!] : []));
const plugins = await loadPlugins(pluginPaths, {builtinDir: !args.includes('--no-plugins')});

// Node 22+ reads the Windows console in VT mode, which is what passes mouse reports through;
// with older versions the wheel would do nothing and plain drag-to-select would be lost for it.
const mouseReports = process.platform !== 'win32' || Number(process.versions.node.split('.')[0]) >= 22;

const settings = {
	unicode: !args.includes('--ascii') && detectUnicode(),
	expandTools: false,
	simulateErrors: false,
	mouse: args.includes('--mouse') || (!args.includes('--no-mouse') && mouseReports),
};

// Full screen: draw on the alternate screen so the shell's scrollback is left as it was.
const ENTER_SCREEN = '\x1b[?1049h\x1b[H\x1b[2J';
// Whatever happens, never leave the terminal with mouse reporting on or the cursor hidden.
const LEAVE_SCREEN = `${MOUSE_OFF}\x1b[?25h\x1b[?1049l`;

let restored = false;
let releaseConsole = () => {};
function restoreTerminal() {
	if (restored) return;
	restored = true;
	releaseConsole();
	process.stdout.write(LEAVE_SCREEN);
}

process.on('exit', restoreTerminal);
// Ctrl+C arrives as a key in raw mode; a SIGINT from elsewhere must still restore the screen.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => process.exit(1));
// Print crashes after leaving the alternate screen, or they vanish with it.
for (const event of ['uncaughtException', 'unhandledRejection'] as const) {
	process.on(event, error => {
		restoreTerminal();
		console.error(error);
		process.exit(1);
	});
}

function printSummary({turns, files}: ExitSummary) {
	if (turns === 0) return;
	const head = `${APP_NAME} ${turns} turn${turns === 1 ? '' : 's'}`;
	if (files.length === 0) return console.log(`${head}, no files changed.`);
	console.log(`${head}, ${files.length} file${files.length === 1 ? '' : 's'} changed:`);
	for (const file of files) {
		const delta = file.delta ? ` (${file.delta > 0 ? '+' : ''}${file.delta})` : '';
		console.log(`  ${file.status} ${file.path}${delta}`);
	}
}

process.stdout.write(ENTER_SCREEN);
releaseConsole = captureConsole();
// Ctrl+C is handled by the app: it clears input, interrupts, or asks to confirm exit.
const app = render(<App initialSettings={settings} plugins={plugins} />, {exitOnCtrlC: false, patchConsole: false});
try {
	const summary = (await app.waitUntilExit()) as ExitSummary | undefined;
	restoreTerminal();
	if (summary) printSummary(summary);
} catch (error) {
	restoreTerminal();
	console.error(error);
	process.exitCode = 1;
}
