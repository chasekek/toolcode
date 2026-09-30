import {readdirSync} from 'node:fs';
import path from 'node:path';

const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.venv', '__pycache__']);

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
				if (files.length >= limit) return {files, truncated: true};
				files.push(rel);
			}
		}
	}
	return {files, truncated: false};
}
