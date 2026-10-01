import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {isFile, runProcess, type ProcessRunner} from './process.js';

/**
 * Before/after views of the workspace around a delegated run. Only read-only git
 * commands are used (status, rev-parse, diff): delegation never commits, resets,
 * stashes or checks out, so the user's own uncommitted work is left alone.
 */

export const GIT_READ_ONLY = ['status', 'rev-parse', 'diff'];

interface Entry {
	/** Porcelain XY code, e.g. " M", "??", "D ". */
	code: string;
	/** Content hash, so a file that was already dirty and changed again is still noticed. */
	hash: string | null;
}

export interface WorkspaceSnapshot {
	/** False outside a git repository; changes are then unavailable rather than guessed. */
	git: boolean;
	root?: string;
	head?: string;
	/** Dirty paths relative to the repository root, with forward slashes. */
	entries: Map<string, Entry>;
}

export interface WorkspaceChanges {
	available: boolean;
	/** Paths relative to the workspace, forward slashes. */
	added: string[];
	modified: string[];
	deleted: string[];
	/** Files that had uncommitted changes before the run and changed again. */
	preexisting: string[];
	/** Files the run returned to their committed state (it may have discarded edits). */
	reverted: string[];
	/** HEAD moved during the run: the agent committed, checked out or reset. */
	headMoved: boolean;
	/** `git diff --stat` for the changed tracked files, when there are any. */
	diffStat?: string;
}

// Hashing is for telling dirty-before from dirty-after; skip it on huge untracked trees.
const MAX_HASHED = 2000;

async function git(runner: ProcessRunner, cwd: string, args: string[]) {
	if (!GIT_READ_ONLY.includes(args[0]!)) throw new Error(`Refusing to run git ${args[0]}: delegation only reads the repository.`);
	return runner({command: 'git', args, cwd, timeoutMs: 30_000});
}

function hashFile(file: string): string | null {
	try {
		return isFile(file) ? createHash('sha1').update(readFileSync(file)).digest('hex') : null;
	} catch {
		return null;
	}
}

/** Parses `git status --porcelain=v1 -z`; a rename is followed by its old path, which is skipped. */
export function parsePorcelain(output: string): Array<{code: string; file: string}> {
	const parts = output.split('\0');
	const entries: Array<{code: string; file: string}> = [];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i]!;
		if (part.length < 4) continue;
		const code = part.slice(0, 2);
		entries.push({code, file: part.slice(3)});
		if (code[0] === 'R' || code[0] === 'C') i++;
	}
	return entries;
}

export async function snapshotWorkspace(cwd: string, runner: ProcessRunner = runProcess): Promise<WorkspaceSnapshot> {
	const top = await git(runner, cwd, ['rev-parse', '--show-toplevel']);
	if (top.exitCode !== 0) return {git: false, entries: new Map()};
	const root = path.resolve(top.stdout.trim());
	const head = await git(runner, cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']);
	const status = await git(runner, cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
	if (status.exitCode !== 0) return {git: false, entries: new Map()};
	const entries = new Map<string, Entry>();
	for (const [i, {code, file}] of parsePorcelain(status.stdout).entries()) {
		entries.set(file, {code, hash: i < MAX_HASHED ? hashFile(path.join(root, file)) : null});
	}
	return {git: true, root, head: head.exitCode === 0 ? head.stdout.trim() : undefined, entries};
}

/** What changed between two snapshots, limited to the workspace directory. */
export async function compareSnapshots(
	before: WorkspaceSnapshot,
	after: WorkspaceSnapshot,
	cwd: string,
	runner: ProcessRunner = runProcess,
): Promise<WorkspaceChanges> {
	const changes: WorkspaceChanges = {available: false, added: [], modified: [], deleted: [], preexisting: [], reverted: [], headMoved: false};
	if (!before.git || !after.git || !after.root) return changes;
	changes.available = true;
	changes.headMoved = before.head !== after.head;

	const root = after.root;
	const show = (file: string) => {
		const relative = path.relative(path.resolve(cwd), path.join(root, file));
		return relative.startsWith('..') || path.isAbsolute(relative) ? undefined : relative.split(path.sep).join('/');
	};
	const tracked: string[] = [];
	for (const [file, now] of after.entries) {
		const shown = show(file);
		if (shown === undefined) continue;
		const was = before.entries.get(file);
		if (was && was.code === now.code && was.hash === now.hash) continue;
		if (was) changes.preexisting.push(shown);
		if (now.code.includes('D')) changes.deleted.push(shown);
		else if (!was && (now.code === '??' || now.code.includes('A'))) changes.added.push(shown);
		else changes.modified.push(shown);
		if (now.code !== '??') tracked.push(file);
	}
	for (const file of before.entries.keys()) {
		const shown = show(file);
		if (shown !== undefined && !after.entries.has(file)) changes.reverted.push(shown);
	}

	if (tracked.length > 0 && after.head) {
		const stat = await git(runner, root, ['diff', '--stat', 'HEAD', '--', ...tracked.slice(0, 100)]);
		if (stat.exitCode === 0 && stat.stdout.trim()) changes.diffStat = stat.stdout.trimEnd();
	}
	return changes;
}

export function countChanges(changes: WorkspaceChanges): number {
	return changes.added.length + changes.modified.length + changes.deleted.length + changes.reverted.length;
}
