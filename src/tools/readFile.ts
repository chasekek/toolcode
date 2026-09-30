import {readFile as fsReadFile, stat} from 'node:fs/promises';
import {countLines, displayPath, resolveInWorkspace} from './paths.js';
import type {Tool} from './types.js';

const MAX_BYTES = 256 * 1024;
/** Most lines returned in one read, so a huge file can't flood the context. */
const MAX_LINES = 2000;

export const readFile: Tool = {
	name: 'read_file',
	label: 'Read',
	description:
		'Read a file in the workspace. Always read a file before editing it. ' +
		'Pass offset/limit to page through a large file; the result reports the total line count ' +
		'and the next offset to read.',
	parameters: {
		type: 'object',
		properties: {
			path: {type: 'string', description: 'File path relative to the workspace root.'},
			offset: {type: 'number', description: '1-based line to start at. Defaults to 1.'},
			limit: {type: 'number', description: `Maximum lines to return. Defaults to ${MAX_LINES}.`},
		},
		required: ['path'],
		additionalProperties: false,
	},
	readOnly: true,
	describe: args => {
		const start = positiveInt(args['offset'], 1);
		const limit = positiveInt(args['limit'], MAX_LINES);
		// Only mention the range when it narrows the read, so plain reads stay terse.
		return start > 1 || limit < MAX_LINES ? `${String(args['path'] ?? '')}:${start}+${limit}` : String(args['path'] ?? '');
	},
	async run(args, {cwd}) {
		const file = resolveInWorkspace(cwd, args['path']);
		const info = await stat(file);
		if (info.isDirectory()) throw new Error(`${displayPath(cwd, file)} is a directory.`);
		if (info.size > MAX_BYTES) throw new Error(`File is ${info.size} bytes; the limit is ${MAX_BYTES}.`);

		const buffer = await fsReadFile(file);
		if (buffer.includes(0)) throw new Error('File looks binary; only text files can be read.');
		const text = buffer.toString('utf8');
		const total = countLines(text);
		if (total === 0) return {status: 'success', summary: 'Read 0 lines', output: '', content: '(empty file)'};

		const offset = positiveInt(args['offset'], 1);
		const limit = Math.min(positiveInt(args['limit'], MAX_LINES), MAX_LINES);
		if (offset > total) throw new Error(`${displayPath(cwd, file)} has ${total} lines; offset ${offset} is past the end.`);

		// A trailing newline makes split() yield an empty final entry, which countLines has
		// already discounted. Drop it so reported line numbers match what the model sees.
		const all = text.split('\n');
		if (all.length > total) all.pop();
		const slice = all.slice(offset - 1, offset - 1 + limit);
		const shown = slice.length;
		const body = slice.join('\n');
		const next = offset + shown;

		// A whole-file read keeps the terse summary it has always had; only a partial
		// read spells out where it landed, since the model needs that to page onward.
		const partial = offset > 1 || next <= total;
		const summary = partial
			? `Read ${shown} of ${total} lines (lines ${offset}-${next - 1})`
			: `Read ${total} line${total === 1 ? '' : 's'}`;

		// Hand back the exact next offset rather than making the model guess one.
		const more = next <= total ? `\n[Truncated: ${total} lines total. Read more with offset=${next}.]` : '';

		return {
			status: 'success',
			summary,
			output: body,
			content: `${body}${more}`,
		};
	},
};

/** Coerces a model-supplied line number, ignoring junk and non-positive values. */
function positiveInt(value: unknown, fallback: number): number {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n) || n < 1) return fallback;
	return Math.floor(n);
}
