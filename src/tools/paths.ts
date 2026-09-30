import path from 'node:path';

/** Resolves a model-supplied path against the workspace, refusing anything outside it. */
export function resolveInWorkspace(cwd: string, file: unknown): string {
	if (typeof file !== 'string' || !file.trim()) throw new Error('A non-empty "path" is required.');
	const root = path.resolve(cwd);
	const resolved = path.resolve(root, file);
	const relative = path.relative(root, resolved);
	if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(`"${file}" is outside the workspace (${root}).`);
	}
	return resolved;
}

/** Path relative to the workspace with forward slashes, for display. */
export function displayPath(cwd: string, file: string): string {
	return path.relative(path.resolve(cwd), file).split(path.sep).join('/');
}

export function countLines(text: string): number {
	if (text === '') return 0;
	return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}
