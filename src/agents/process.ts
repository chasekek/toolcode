import {spawn} from 'node:child_process';
import {existsSync, statSync} from 'node:fs';
import path from 'node:path';

export interface ProcessOptions {
	command: string;
	args: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
	/** Written to stdin, which is then closed. */
	input?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export interface ProcessResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	aborted: boolean;
	/** Set when the process could not be started, e.g. ENOENT or EACCES. */
	error?: {code: string; message: string};
}

/** Runs a process to completion. Injected wherever an external CLI is called, so tests never need the real one. */
export type ProcessRunner = (options: ProcessOptions) => Promise<ProcessResult>;

// Delegated agents can be chatty; keep the tail rather than growing without bound.
const MAX_OUTPUT = 8 * 1024 * 1024;
const KILL_GRACE_MS = 5000;

// cmd.exe parses the command line of a .cmd/.bat shim, so only plain tokens may reach it.
const SAFE_SHELL_ARG = /^[\w.,:=/@+-]+$/;

/** Whether Windows needs a shell to start this file (npm installs CLIs as .cmd shims). */
export function needsShell(command: string, platform: NodeJS.Platform = process.platform): boolean {
	return platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function append(buffer: string, chunk: string): string {
	const next = buffer + chunk;
	return next.length > MAX_OUTPUT ? next.slice(next.length - MAX_OUTPUT) : next;
}

/** Stops the process and everything it started, so a timed-out agent leaves no workers behind. */
function killTree(pid: number | undefined, force: boolean): void {
	if (pid === undefined) return;
	try {
		if (process.platform === 'win32') {
			spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {stdio: 'ignore', windowsHide: true});
		} else {
			// Negative pid: the whole process group (the child was started detached).
			process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');
		}
	} catch {
		// Already gone.
	}
}

export const runProcess: ProcessRunner = options =>
	new Promise(resolve => {
		const {command, args, cwd, env, input, timeoutMs, signal} = options;
		const shell = needsShell(command);
		if (shell) {
			const bad = args.find(a => !SAFE_SHELL_ARG.test(a));
			if (bad !== undefined) {
				resolve({exitCode: null, stdout: '', stderr: '', timedOut: false, aborted: false, error: {code: 'EINVAL', message: `Unsafe argument for a shell launch: ${bad}`}});
				return;
			}
		}
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		let aborted = signal?.aborted ?? false;
		let settled = false;

		const child = spawn(shell ? `"${command}"` : command, args, {
			cwd,
			env,
			shell,
			windowsHide: true,
			detached: process.platform !== 'win32',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		const stop = () => {
			killTree(child.pid, false);
			setTimeout(() => killTree(child.pid, true), KILL_GRACE_MS).unref();
		};
		const timer = timeoutMs
			? setTimeout(() => {
					timedOut = true;
					stop();
				}, timeoutMs)
			: undefined;
		const onAbort = () => {
			aborted = true;
			stop();
		};
		signal?.addEventListener('abort', onAbort, {once: true});
		if (aborted) stop();

		const finish = (result: Omit<ProcessResult, 'stdout' | 'stderr' | 'timedOut' | 'aborted'>) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			resolve({...result, stdout, stderr, timedOut, aborted});
		};

		child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout = append(stdout, chunk)));
		child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr = append(stderr, chunk)));
		child.on('error', (error: NodeJS.ErrnoException) => finish({exitCode: null, error: {code: error.code ?? 'UNKNOWN', message: error.message}}));
		child.on('close', code => finish({exitCode: code}));
		// A process that exits without reading stdin makes the write fail; that is not our error.
		child.stdin.on('error', () => {});
		child.stdin.end(input ?? '');
	});

/**
 * Finds an executable on PATH, the way a shell would. On Windows this tries each
 * PATHEXT extension, since a bare name can't be spawned there.
 */
export function findExecutable(name: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | undefined {
	const dirs = (env['PATH'] ?? env['Path'] ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
	const exts = platform === 'win32' ? (env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
	for (const dir of dirs) {
		for (const ext of exts) {
			const candidate = path.join(dir, name + ext.toLowerCase());
			if (isFile(candidate)) return candidate;
		}
	}
	return undefined;
}

export function isFile(file: string): boolean {
	try {
		return existsSync(file) && statSync(file).isFile();
	} catch {
		return false;
	}
}
