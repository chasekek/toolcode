import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {countLines, displayPath, resolveInWorkspace} from './paths.js';
import type {Tool} from './types.js';

export const editFile: Tool = {
	name: 'edit_file',
	label: 'Edit',
	description:
		'Replace an exact snippet in an existing file. Pass "old_string" as the text to replace, copied ' +
		'verbatim from the file including indentation, and "new_string" as its replacement. ' +
		'Prefer this over write_file for changing part of a file: it leaves the rest untouched. ' +
		'"old_string" must appear exactly once; include a few surrounding lines if it is ambiguous. ' +
		'Set "replace_all" to true to change every occurrence.',
	parameters: {
		type: 'object',
		properties: {
			path: {type: 'string', description: 'File path relative to the workspace root.'},
			old_string: {type: 'string', description: 'The exact text to replace, including indentation.'},
			new_string: {type: 'string', description: 'The text to replace it with.'},
			replace_all: {type: 'boolean', description: 'Replace every occurrence instead of requiring exactly one.'},
		},
		required: ['path', 'old_string', 'new_string'],
		additionalProperties: false,
	},
	readOnly: false,
	describe: args => String(args['path'] ?? ''),
	async run(args, {cwd}) {
		const file = resolveInWorkspace(cwd, args['path']);
		const oldString = args['old_string'];
		const newString = args['new_string'];
		if (typeof oldString !== 'string' || oldString === '') throw new Error('"old_string" must be a non-empty string.');
		if (typeof newString !== 'string') throw new Error('"new_string" must be a string.');

		const rel = displayPath(cwd, file);
		let before: string;
		try {
			const info = await stat(file);
			if (info.isDirectory()) throw new Error(`${rel} is a directory.`);
			before = await readFile(file, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				throw new Error(`${rel} does not exist. Use write_file to create it.`);
			}
			throw error;
		}

		const occurrences = countOccurrences(before, oldString);
		const replaceAll = args['replace_all'] === true;
		if (occurrences === 0) {
			throw new Error(
				`"${preview(oldString)}" was not found in ${rel}. The text must match the file exactly, ` +
					`including indentation and line endings. Read the file again and copy the snippet verbatim.`,
			);
		}
		if (occurrences > 1 && !replaceAll) {
			throw new Error(
				`"${preview(oldString)}" appears ${occurrences} times in ${rel}. Include more surrounding ` +
					`context to make it unique, or set replace_all to true.`,
			);
		}

		const after = replaceAll ? before.split(oldString).join(newString) : before.replace(oldString, () => newString);
		if (after === before) return {status: 'success', summary: `Edited ${rel} (no changes)`, output: after, content: `${rel} already matched; no changes made.`};

		await mkdir(path.dirname(file), {recursive: true});
		await writeFile(file, after, 'utf8');

		const delta = countLines(after) - countLines(before);
		const change = delta === 0 ? '' : `, ${delta > 0 ? '+' : ''}${delta}`;
		const howmany = replaceAll && occurrences > 1 ? `${occurrences} spots in ` : '';
		return {
			status: 'success',
			summary: `Edited ${howmany}${rel} (${countLines(after)} lines${change})`,
			output: after,
			content: `Edited ${howmany}${rel} (${countLines(after)} lines${change}).`,
		};
	},
};

/** Non-overlapping occurrences of `needle`, so a doubled match isn't double-counted. */
function countOccurrences(haystack: string, needle: string): number {
	let count = 0;
	for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count++;
	return count;
}

/** A short single-line excerpt for error messages, so they stay readable. */
function preview(text: string): string {
	const flat = text.replace(/\n/g, '\\n').trim();
	return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}
