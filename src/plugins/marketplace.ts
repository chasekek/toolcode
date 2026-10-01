import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPluginFile, PLUGIN_DIR, unloadPlugin} from './loader.js';
import type {LoadedPlugin} from './types.js';

export interface CatalogEntry {
	id: string;
	name: string;
	category: 'tool' | 'provider' | 'command';
	description: string;
	/** Plugin file, relative to the catalog. */
	file: string;
}

/** The plugins folder shipped with TOOLCODE (next to dist/ and src/). */
const CATALOG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins');

export function readCatalog(): CatalogEntry[] {
	const raw = JSON.parse(readFileSync(path.join(CATALOG_DIR, 'marketplace.json'), 'utf8')) as {plugins?: CatalogEntry[]};
	return (raw.plugins ?? []).filter(e => e && /^[a-z0-9-]+$/.test(e.id) && typeof e.file === 'string');
}

/** The bundled source of an entry, next to the catalog. */
export function catalogPath(entry: CatalogEntry): string {
	return path.join(CATALOG_DIR, entry.file);
}

/**
 * Where an entry stands: not here yet, installed into the plugins folder, or already
 * loaded from the bundled copy (say via `--plugin plugins`). The file check alone misses
 * the last case, so the page used to call a loaded plugin installable and then refuse it.
 */
export type CatalogState = 'available' | 'installed' | 'loaded';

export function catalogState(entry: CatalogEntry, loaded: LoadedPlugin[]): CatalogState {
	if (isInstalled(entry)) return 'installed';
	const source = path.resolve(catalogPath(entry));
	return loaded.some(p => path.resolve(p.file) === source) ? 'loaded' : 'available';
}

/** Installed plugins are single .mjs files in the plugins folder, named after their catalog id. */
export function installPath(entry: CatalogEntry): string {
	return path.join(PLUGIN_DIR, `${entry.id}.mjs`);
}

export function isInstalled(entry: CatalogEntry): boolean {
	return existsSync(installPath(entry));
}

/** Copies the plugin into the plugins folder and loads it right away; nothing is left behind if it fails. */
export async function install(entry: CatalogEntry): Promise<LoadedPlugin> {
	const target = installPath(entry);
	if (existsSync(target)) throw new Error(`${entry.name} is already installed.`);
	mkdirSync(PLUGIN_DIR, {recursive: true});
	copyFileSync(catalogPath(entry), target);
	try {
		return await loadPluginFile(target);
	} catch (error) {
		rmSync(target, {force: true});
		throw error;
	}
}

/** Unloads the plugin (if it's loaded) and deletes its file. */
export function uninstall(entry: CatalogEntry, loaded: LoadedPlugin | undefined): void {
	if (loaded) unloadPlugin(loaded);
	rmSync(installPath(entry), {force: true});
}
