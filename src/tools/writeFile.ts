import {mkdir, readFile, stat, writeFile as fsWriteFile} from 'node:fs/promises';
import path from 'node:path';
import {countLines, displayPath, resolveInWorkspace} from './paths.js';
import type {Tool} from './types.js';

async function existingText(file: string): Promise<string | null> {
	try {
		const info = await stat(file);
		if (info.isDirectory()) throw new Error(`${file} is a directory.`);
		return await readFile(file, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}
}

export const writeFile: Tool = {
	name: 'write_file',
	label: 'Write',
	description:
		'Create a file or overwrite an existing one with the complete new contents. ' +
		'Parent directories are created as needed. Always send the whole file, never a fragment or diff.',
	parameters: {
		type: 'object',
		properties: {
			path: {type: 'string', description: 'File path relative to the workspace root.'},
			content: {type: 'string', description: 'The complete contents of the file.'},
		},
		required: ['path', 'content'],
		additionalProperties: false,
	},
	readOnly: false,
	describe: args => String(args['path'] ?? ''),
	async run(args, {cwd}) {
		const file = resolveInWorkspace(cwd, args['path']);
		const content = args['content'];
		if (typeof content !== 'string') throw new Error('"content" must be a string.');

		const before = await existingText(file);
		await mkdir(path.dirname(file), {recursive: true});
		await fsWriteFile(file, content, 'utf8');

		const rel = displayPath(cwd, file);
		const lines = countLines(content);
		const size = `${lines} line${lines === 1 ? '' : 's'}`;
		if (before === null) {
			return {status: 'success', summary: `Created file (${size})`, output: content, content: `Created ${rel} (${size}).`};
		}
		const delta = lines - countLines(before);
		const change = delta === 0 ? '' : `, ${delta > 0 ? '+' : ''}${delta}`;
		return {
			status: 'success',
			summary: before === content ? 'Edited file (no changes)' : `Edited file (${size}${change})`,
			output: content,
			content: `Wrote ${rel} (${size}).`,
		};
	},
};
