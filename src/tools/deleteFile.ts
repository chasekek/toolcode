import {rm, stat} from 'node:fs/promises';
import {displayPath, resolveInWorkspace} from './paths.js';
import type {Tool} from './types.js';

export const deleteFile: Tool = {
	name: 'delete_file',
	label: 'Delete',
	description: 'Delete a single file in the workspace. Directories cannot be deleted.',
	parameters: {
		type: 'object',
		properties: {
			path: {type: 'string', description: 'File path relative to the workspace root.'},
		},
		required: ['path'],
		additionalProperties: false,
	},
	readOnly: false,
	describe: args => String(args['path'] ?? ''),
	async run(args, {cwd}) {
		const file = resolveInWorkspace(cwd, args['path']);
		const info = await stat(file);
		if (!info.isFile()) throw new Error(`${displayPath(cwd, file)} is not a file.`);
		await rm(file);
		return {status: 'success', summary: 'Deleted file', content: `Deleted ${displayPath(cwd, file)}.`};
	},
};
