import {existsSync, readdirSync, statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isCommandTaken, registerCommand, unregisterCommand} from '../core/commands.js';
import {getProvider, registerProvider, unregisterProvider} from '../providers/registry.js';
import {getTool, registerTool, unregisterTool} from '../tools/registry.js';
import {normalizeCommand, normalizeProvider, normalizeTool} from './normalize.js';
import type {LoadedPlugin, PluginDefinition} from './types.js';

const EXTENSIONS = ['.js', '.mjs'];

/** Where plugins are picked up automatically (and where the marketplace installs them). */
export const PLUGIN_DIR = process.env['TOOLCODE_PLUGIN_DIR'] || path.join(os.homedir(), '.toolcode', 'plugins');

/**
 * Plugin entry points in a directory: loose .js/.mjs files, folders with an
 * index file, and one level of grouping folders without one (e.g. providers/, tools/).
 */
function findEntries(dir: string, depth = 0): string[] {
	if (!existsSync(dir)) return [];
	const entries: string[] = [];
	for (const name of readdirSync(dir).sort()) {
		if (name.startsWith('.') || name.startsWith('_')) continue;
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) {
			const index = EXTENSIONS.map(ext => path.join(full, `index${ext}`)).find(existsSync);
			if (index) entries.push(index);
			else if (depth === 0) entries.push(...findEntries(full, depth + 1));
		} else if (EXTENSIONS.includes(path.extname(name))) {
			entries.push(full);
		}
	}
	return entries;
}

function firstTaken(names: string[], taken: (name: string) => unknown): string | undefined {
	return names.find((name, i) => taken(name) || names.indexOf(name) !== i);
}

/** Imports one plugin file and registers what it defines. Used at startup and by the marketplace. */
export async function loadPluginFile(file: string): Promise<LoadedPlugin> {
	// The query string bypasses Node's module cache, so a reinstalled plugin loads fresh.
	const url = `${pathToFileURL(file).href}?t=${Date.now()}`;
	const module = (await import(url)) as {default?: PluginDefinition | (() => PluginDefinition | Promise<PluginDefinition>)};
	const exported = module.default;
	const def = typeof exported === 'function' ? await exported() : exported;
	if (!def || typeof def !== 'object') throw new Error('Expected `export default {tools: [...], providers: [...], commands: [...]}`.');

	// Validate everything before registering anything, so a broken plugin adds nothing.
	const tools = (def.tools ?? []).map(normalizeTool);
	const providers = (def.providers ?? []).map(normalizeProvider);
	const commands = (def.commands ?? []).map(normalizeCommand);
	if (tools.length + providers.length + commands.length === 0) throw new Error('Plugin defines no tools, providers or commands.');
	const toolNames = tools.map(t => t.name);
	const providerIds = providers.map(p => p.id);
	const commandNames = commands.map(c => c.name);
	const takenTool = firstTaken(toolNames, getTool);
	if (takenTool) throw new Error(`Tool name "${takenTool}" is already taken.`);
	const takenProvider = firstTaken(providerIds, getProvider);
	if (takenProvider) throw new Error(`Provider id "${takenProvider}" is already taken.`);
	const takenCommand = firstTaken(commandNames, isCommandTaken);
	if (takenCommand) throw new Error(`Command ${takenCommand} is already taken.`);
	for (const tool of tools) registerTool(tool);
	for (const provider of providers) registerProvider(provider);
	for (const command of commands) registerCommand(command);

	const base = path.basename(file).replace(/\.m?js$/, '');
	return {
		name: def.name ?? (base === 'index' ? path.basename(path.dirname(file)) : base),
		file,
		tools: toolNames,
		providers: providerIds,
		commands: commandNames,
	};
}

/** Removes everything a loaded plugin registered. */
export function unloadPlugin(plugin: LoadedPlugin): void {
	plugin.tools.forEach(unregisterTool);
	plugin.providers.forEach(unregisterProvider);
	plugin.commands.forEach(unregisterCommand);
}

export interface PluginLoadReport {
	loaded: LoadedPlugin[];
	errors: Array<{file: string; message: string}>;
}

/**
 * Loads every plugin in ~/.toolcode/plugins plus any extra paths (files or
 * directories). A failing plugin is reported and skipped; it never stops startup.
 */
export async function loadPlugins(extra: string[] = [], {builtinDir = true} = {}): Promise<PluginLoadReport> {
	const report: PluginLoadReport = {loaded: [], errors: []};
	const files = [
		...(builtinDir ? findEntries(PLUGIN_DIR) : []),
		...extra.flatMap(p => {
			const full = path.resolve(p);
			if (!existsSync(full)) {
				report.errors.push({file: full, message: 'File not found.'});
				return [];
			}
			return statSync(full).isDirectory() ? findEntries(full) : [full];
		}),
	];

	// Plain .js plugins outside a "type": "module" package make Node warn on stderr; they're fine, so hush it.
	const emitWarning = process.emitWarning;
	process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
		const code = typeof rest[0] === 'object' ? (rest[0] as {code?: string}).code : rest[1];
		if (code === 'MODULE_TYPELESS_PACKAGE_JSON') return;
		(emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest);
	}) as typeof process.emitWarning;
	try {
		for (const file of [...new Set(files)]) {
			try {
				report.loaded.push(await loadPluginFile(file));
			} catch (error) {
				report.errors.push({file, message: error instanceof Error ? error.message : String(error)});
			}
		}
	} finally {
		process.emitWarning = emitWarning;
	}
	return report;
}
