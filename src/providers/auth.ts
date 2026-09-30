import {chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where /auth saves API keys. Read on each call so tests can point it elsewhere. */
export function authFile(): string {
	return process.env['TOOLCODE_AUTH_FILE'] || path.join(os.homedir(), '.toolcode', 'auth.json');
}

// Keys are read on every render (footer, model picker), so keep the file in memory.
let cache: {file: string; keys: Record<string, string>} | undefined;

function load(): Record<string, string> {
	const file = authFile();
	if (cache?.file === file) return cache.keys;
	let keys: Record<string, string> = {};
	if (existsSync(file)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
			if (parsed && typeof parsed === 'object') {
				keys = Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'));
			}
		} catch {
			// A corrupt file behaves like an empty one; the next save rewrites it.
		}
	}
	cache = {file, keys};
	return keys;
}

function save(keys: Record<string, string>): void {
	const file = authFile();
	mkdirSync(path.dirname(file), {recursive: true});
	writeFileSync(file, JSON.stringify(keys, null, '\t') + '\n', {mode: 0o600});
	// `mode` only applies when the file is created; tighten an existing one too.
	chmodSync(file, 0o600);
	cache = {file, keys};
}

/** The key saved with /auth for a provider, if any. */
export function getStoredKey(providerId: string): string | undefined {
	return load()[providerId] || undefined;
}

export function setStoredKey(providerId: string, key: string): void {
	const trimmed = key.trim();
	if (!trimmed) throw new Error('API key is empty.');
	save({...load(), [providerId]: trimmed});
}

/** Returns whether a key was removed. */
export function removeStoredKey(providerId: string): boolean {
	const keys = load();
	if (!(providerId in keys)) return false;
	const {[providerId]: _removed, ...rest} = keys;
	save(rest);
	return true;
}
