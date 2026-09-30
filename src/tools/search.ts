import {readdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {BINARY_EXTENSIONS, IGNORED} from '../core/workspace.js';
import {displayPath, resolveInWorkspace} from './paths.js';
import type {Tool} from './types.js';

/** Stops one runaway search from swamping the context. */
const MAX_RESULTS = 100;
/** Files bigger than this are skipped; they are almost always generated. */
const MAX_BYTES = 512 * 1024;

interface Hit {
	file: string;
	line: number;
	text: string;
}

export const search: Tool = {
	name: 'search',
	label: 'Search',
	description:
		'Search the workspace for text and return matching lines, in "path:line: text" form. ' +
		'Use this to find where something is defined or used instead of reading files one by one. ' +
		'"query" is a regular expression; escape it if you want a literal match. ' +
		'Narrow the search with "glob" (a filename pattern such as "*.ts") or "path" (a file or directory).',
	parameters: {
		type: 'object',
		properties: {
			query: {type: 'string', description: 'Regular expression to search for.'},
			path: {type: 'string', description: 'File or directory to restrict the search to. Defaults to the workspace root.'},
			glob: {type: 'string', description: 'Only search files whose name matches this pattern, e.g. "*.ts" or "*test*".'},
			case_sensitive: {type: 'boolean', description: 'Match case exactly. Defaults to false.'},
		},
		required: ['query'],
		additionalProperties: false,
	},
	readOnly: true,
	describe: args => {
		const query = String(args['query'] ?? '');
		const where = args['path'] ? ` in ${String(args['path'])}` : '';
		const glob = args['glob'] ? ` (${String(args['glob'])})` : '';
		return `${query}${where}${glob}`;
	},
	async run(args, {cwd}) {
		const query = args['query'];
		if (typeof query !== 'string' || !query) throw new Error('A non-empty "query" is required.');

		// A bad pattern from the model should read as a fixable message, not a stack trace.
		let pattern: RegExp;
		try {
			pattern = new RegExp(query, args['case_sensitive'] === true ? '' : 'i');
		} catch (error) {
			throw new Error(`"${query}" is not a valid regular expression: ${(error as Error).message}`);
		}

		const glob = typeof args['glob'] === 'string' && args['glob'].trim() ? globToRegExp(args['glob']) : null;
		const root = args['path'] ? resolveInWorkspace(cwd, args['path']) : path.resolve(cwd);

		const hits: Hit[] = [];
		let filesSearched = 0;
		let truncated = false;
		for await (const file of walk(root)) {
			if (glob && !glob.test(path.basename(file))) continue;
			filesSearched++;
			for (const hit of await searchFile(file, pattern)) {
				if (hits.length >= MAX_RESULTS) {
					truncated = true;
					break;
				}
				hits.push({file: displayPath(cwd, file), line: hit.line, text: hit.text});
			}
			if (truncated) break;
		}

		if (hits.length === 0) {
			return {
				status: 'success',
				summary: `No matches for ${query}`,
				output: '',
				content: `No matches for ${query} in ${filesSearched} file${filesSearched === 1 ? '' : 's'}.`,
			};
		}

		// Cap each line so one minified-ish file can't produce a single enormous result.
		const body = hits.map(h => `${h.file}:${h.line}: ${truncateLine(h.text)}`).join('\n');
		const note = truncated
			? `\n[Stopped at ${MAX_RESULTS} matches. Narrow the search with "glob" or "path".]`
			: '';
		return {
			status: 'success',
			summary: `${hits.length} match${hits.length === 1 ? '' : 'es'} for ${query}`,
			output: body,
			content: `${body}${note}`,
		};
	},
};

/** Every searchable file under `root`, breadth first, skipping ignored and binary files. */
async function* walk(root: string): AsyncGenerator<string> {
	const queue = [root];
	while (queue.length > 0) {
		const dir = queue.shift()!;
		let entries;
		try {
			entries = await readdir(dir, {withFileTypes: true});
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED.has(entry.name)) queue.push(full);
			} else if (entry.isFile() && !BINARY_EXTENSIONS.has(entry.name.split('.').pop()?.toLowerCase() ?? '')) {
				yield full;
			}
		}
	}
}

/** Matching lines in one file; unreadable or oversized files yield nothing. */
async function searchFile(file: string, pattern: RegExp): Promise<Hit[]> {
	try {
		const info = await stat(file);
		if (info.size > MAX_BYTES) return [];
		const buffer = await readFile(file);
		// Same binary sniff the read tool uses, so both agree on what is text.
		if (buffer.includes(0)) return [];
		const hits: Hit[] = [];
		buffer.toString('utf8').split('\n').forEach((text, i) => {
			// The pattern is reused across files, so reset lastIndex between tests.
			pattern.lastIndex = 0;
			if (pattern.test(text)) hits.push({file, line: i + 1, text: text.trim()});
		});
		return hits;
	} catch {
		return [];
	}
}

function truncateLine(text: string): string {
	return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/** Translates a shell-style glob into an anchored, case-insensitive filename regex. */
function globToRegExp(glob: string): RegExp {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`, 'i');
}
