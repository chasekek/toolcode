import {readdirSync} from 'node:fs';
import path from 'node:path';

/** Directories never descended into, shared with the search tool. */
export const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.venv', '__pycache__']);

/**
 * Binary and media files. Excluded from the file snapshot and skipped by the
 * search tool, since neither is useful to read or match text against.
 */
export const BINARY_EXTENSIONS = new Set([
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'pdf', 'zip', 'gz', 'tar', 'bz2', 'xz',
	'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'mov', 'avi', 'wasm', 'so', 'dylib', 'dll', 'exe',
]);

/**
 * Snapshot of the workspace's files (relative, forward slashes), breadth
 * first so shallow files survive the cap. Gives the model a map of the
 * project without needing a listing tool.
 */
export function listFiles(cwd: string, limit = 400): {files: string[]; truncated: boolean} {
	const files: string[] = [];
	const queue = [''];
	while (queue.length > 0) {
		const dir = queue.shift()!;
		let entries;
		try {
			entries = readdirSync(path.join(cwd, dir), {withFileTypes: true});
		} catch {
			continue;
		}
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			const rel = dir ? `${dir}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (!IGNORED.has(entry.name)) queue.push(rel);
			} else if (entry.isFile()) {
				if (!BINARY_EXTENSIONS.has(entry.name.split('.').pop()?.toLowerCase() ?? '')) {
					if (files.length >= limit) return {files, truncated: true};
					files.push(rel);
				}
			}
		}
	}
	return {files, truncated: false};
}
