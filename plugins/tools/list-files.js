// A tool plugin: lets the model list a directory.
// Copy to ~/.toolcode/plugins/tools/ to use it.
import {readdir} from 'node:fs/promises';

export default {
	name: 'list-files',
	tools: [
		{
			name: 'list_files',
			label: 'List',
			description: 'List the files and folders in a directory of the workspace.',
			parameters: {
				type: 'object',
				properties: {
					path: {type: 'string', description: 'Directory relative to the workspace root. Use "." for the root.'},
				},
				required: ['path'],
			},
			readOnly: true, // never changes anything, so it also works in plan mode
			async run({path}, ctx) {
				const dir = path === '.' ? ctx.cwd : ctx.resolvePath(path);
				const entries = await readdir(dir, {withFileTypes: true});
				const lines = entries.map(e => (e.isDirectory() ? `${e.name}/` : e.name));
				return {
					content: lines.join('\n') || '(empty directory)',
					summary: `Listed ${lines.length} entries`,
				};
			},
		},
	],
};
