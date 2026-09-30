#!/usr/bin/env node
import {render} from 'ink';
import {loadPlugins, PLUGIN_DIR} from './plugins/loader.js';
import {App} from './ui/App.js';
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
  -v, --version  Print the version
  -h, --help     Show this help
      --ascii          Use plain ASCII symbols
      --plugin <path>  Load a plugin file or folder (repeatable)
      --no-plugins     Skip plugins in ${PLUGIN_DIR}

Plugins in ${PLUGIN_DIR} load automatically.

Environment:
  OPENROUTER_API_KEY  API key for OpenRouter`);
	process.exit(0);
}

if (!process.stdin.isTTY) {
	console.error(`${APP_NAME} needs an interactive terminal.`);
	process.exit(1);
}

const pluginPaths = args.flatMap((arg, i) => (arg === '--plugin' && args[i + 1] ? [args[i + 1]!] : []));
const plugins = await loadPlugins(pluginPaths, {builtinDir: !args.includes('--no-plugins')});

const settings = {
	unicode: !args.includes('--ascii') && detectUnicode(),
	expandTools: false,
	simulateErrors: false,
};

// Ctrl+C is handled by the app: it clears input, interrupts, or asks to confirm exit.
render(<App initialSettings={settings} plugins={plugins} />, {exitOnCtrlC: false});
