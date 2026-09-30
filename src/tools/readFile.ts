import {readFile as fsReadFile, stat} from 'node:fs/promises';
import {countLines, displayPath, resolveInWorkspace} from './paths.js';
import type {Tool} from './types.js';

const MAX_BYTES = 256 * 1024;

export const readFile: Tool = {
	name: 'read_file',
	label: 'Read',
	description: 'Read the full text of a file in the workspace. Always read a file before editing it.',
	parameters: {
		type: 'object',
		properties: {
			path: {type: 'string', description: 'File path relative to the workspace root.'},
		},
		required: ['path'],
		additionalProperties: false,
	},
	readOnly: true,
	describe: args => String(args['path'] ?? ''),
	async run(args, {cwd}) {
		const file = resolveInWorkspace(cwd, args['path']);
		const info = await stat(file);
		if (info.isDirectory()) throw new Error(`${displayPath(cwd, file)} is a directory.`);
		if (info.size > MAX_BYTES) throw new Error(`File is ${info.size} bytes; the limit is ${MAX_BYTES}.`);

		const buffer = await fsReadFile(file);
		if (buffer.includes(0)) throw new Error('File looks binary; only text files can be read.');
		const text = buffer.toString('utf8');
		const lines = countLines(text);
		return {
			status: 'success',
			summary: `Read ${lines} line${lines === 1 ? '' : 's'}`,
			output: text,
			content: text === '' ? '(empty file)' : text,
		};
	},
};
