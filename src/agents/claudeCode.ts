import os from 'node:os';
import path from 'node:path';
import {agentConfig, DEPTH_ENV, delegationDepth, type AgentConfig} from './config.js';
import {findExecutable, isFile, runProcess, type ProcessResult, type ProcessRunner} from './process.js';
import type {AgentDetection, AgentProvider, AgentRequest, AgentRunResult, AgentStatus} from './types.js';

export const CLAUDE_CODE_ID = 'claude-code';

// The tools that run shell commands; Windows builds have PowerShell besides Bash.
const SHELL_TOOLS = ['Bash', 'PowerShell'];
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const MODEL_NAME = /^[\w.:-]+$/;

export interface ClaudeCodeDeps {
	runner?: ProcessRunner;
	config?: () => AgentConfig;
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
	home?: string;
}

/** Where the installers put the executable when it isn't on PATH. */
function knownLocations(home: string, platform: NodeJS.Platform): string[] {
	const exe = platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
	return [path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local')].flatMap(dir => exe.map(name => path.join(dir, name)));
}

/**
 * The executable to run, or why there is none. A configured command wins and is
 * never second-guessed: if it is wrong, the user hears about it.
 */
export function locateClaude(config: AgentConfig, env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): {command?: string; reason?: string} {
	if (config.command) {
		const looksLikePath = config.command.includes('/') || config.command.includes('\\');
		const found = looksLikePath ? (isFile(config.command) ? config.command : undefined) : findExecutable(config.command, env, platform);
		return found ? {command: found} : {reason: `The configured command "${config.command}" was not found.`};
	}
	const found = findExecutable('claude', env, platform) ?? knownLocations(home, platform).find(isFile);
	return found ? {command: found} : {reason: 'Claude Code is not installed (no "claude" on PATH).'};
}

/** Flags for a headless run. The prompt goes in on stdin, so no user text is ever on the command line. */
export function claudeArgs(request: Pick<AgentRequest, 'mode' | 'allowCommands'>, config: AgentConfig): string[] {
	const args = ['-p', '--output-format', 'stream-json', '--verbose'];
	// Plan mode can look but not touch; acceptEdits may edit files in the workspace without asking.
	args.push('--permission-mode', request.mode === 'investigate' ? 'plan' : 'acceptEdits');
	args.push(request.allowCommands && request.mode === 'implement' ? '--allowedTools' : '--disallowedTools', ...SHELL_TOOLS);
	if (config.model && MODEL_NAME.test(config.model)) args.push('--model', config.model);
	return args;
}

interface StreamSummary {
	result?: string;
	isError?: boolean;
	subtype?: string;
	turns?: number;
	costUsd?: number;
	commandsRun: string[];
	filesTouched: string[];
	permissionDenials: string[];
	parsed: boolean;
}

/** Reads Claude Code's stream-json output: tool calls along the way, then one result message. */
export function parseStream(stdout: string): StreamSummary {
	const summary: StreamSummary = {commandsRun: [], filesTouched: [], permissionDenials: [], parsed: false};
	for (const line of stdout.split('\n')) {
		if (!line.trim().startsWith('{')) continue;
		let message: Record<string, any>;
		try {
			message = JSON.parse(line);
		} catch {
			continue;
		}
		summary.parsed = true;
		if (message['type'] === 'assistant' && Array.isArray(message['message']?.content)) {
			for (const block of message['message'].content) {
				if (block?.type !== 'tool_use') continue;
				const input = block.input ?? {};
				if (SHELL_TOOLS.includes(block.name) && typeof input.command === 'string') summary.commandsRun.push(input.command);
				if (EDIT_TOOLS.has(block.name)) {
					const file = input.file_path ?? input.notebook_path;
					if (typeof file === 'string' && !summary.filesTouched.includes(file)) summary.filesTouched.push(file);
				}
			}
		} else if (message['type'] === 'result') {
			if (typeof message['result'] === 'string') summary.result = message['result'];
			summary.isError = message['is_error'] === true;
			if (typeof message['subtype'] === 'string') summary.subtype = message['subtype'];
			if (typeof message['num_turns'] === 'number') summary.turns = message['num_turns'];
			if (typeof message['total_cost_usd'] === 'number') summary.costUsd = message['total_cost_usd'];
			for (const denial of Array.isArray(message['permission_denials']) ? message['permission_denials'] : []) {
				const input = denial?.tool_input ?? {};
				const detail = input.command ?? input.file_path ?? '';
				summary.permissionDenials.push(`${denial?.tool_name ?? 'tool'}${detail ? `: ${detail}` : ''}`);
			}
		}
	}
	return summary;
}

const PERMISSION = /\b(EACCES|EPERM|permission denied|operation not permitted)\b/i;
const AUTH = /not logged in|please run \/login|invalid api key|authentication/i;

/** Maps a finished process to one of the delegation statuses. */
export function classify(proc: ProcessResult, stream: StreamSummary): {status: AgentStatus; note?: string} {
	if (proc.error) {
		if (proc.error.code === 'ENOENT') return {status: 'not_installed', note: proc.error.message};
		if (proc.error.code === 'EACCES' || proc.error.code === 'EPERM') return {status: 'permission_error', note: proc.error.message};
		return {status: 'unknown_error', note: proc.error.message};
	}
	if (proc.timedOut) return {status: 'timeout'};
	if (proc.exitCode === 0 && !stream.isError) return {status: 'success'};
	const text = `${stream.result ?? ''}\n${proc.stderr}`;
	if (AUTH.test(text)) return {status: 'failure', note: 'Claude Code is not signed in. Run `claude` once in a terminal and log in.'};
	if (PERMISSION.test(text)) return {status: 'permission_error'};
	if (proc.exitCode === null) return {status: 'unknown_error', note: 'The process ended without an exit code.'};
	return {status: 'failure', note: stream.subtype && stream.subtype !== 'success' ? `Claude Code stopped: ${stream.subtype}.` : undefined};
}

export function createClaudeCode(deps: ClaudeCodeDeps = {}): AgentProvider {
	const runner = deps.runner ?? runProcess;
	const config = deps.config ?? (() => agentConfig(CLAUDE_CODE_ID));
	const env = () => deps.env ?? process.env;
	const platform = deps.platform ?? process.platform;
	const home = deps.home ?? os.homedir();

	return {
		id: CLAUDE_CODE_ID,
		name: 'Claude Code',
		description: "Anthropic's coding agent. Strong at multi-file changes, refactors, debugging and fixing tests; can run commands when allowed.",
		aliases: ['claude code', 'claude-code', 'claudecode'],
		capabilities: {coding: true, terminal: true, filesystem: true, autonomous: true},

		async detect(): Promise<AgentDetection> {
			const located = locateClaude(config(), env(), platform, home);
			if (!located.command) return {available: false, reason: located.reason};
			const version = await runner({command: located.command, args: ['--version'], cwd: process.cwd(), env: env(), timeoutMs: 15_000});
			if (version.error || version.exitCode !== 0) {
				return {available: false, command: located.command, reason: `"${located.command} --version" failed${version.error ? `: ${version.error.message}` : ` (exit ${version.exitCode})`}.`};
			}
			return {available: true, command: located.command, version: version.stdout.trim().split('\n')[0]};
		},

		async run(request: AgentRequest): Promise<AgentRunResult> {
			const settings = config();
			const located = locateClaude(settings, env(), platform, home);
			if (!located.command) return {status: 'not_installed', exitCode: null, stdout: '', stderr: '', summary: located.reason};
			const proc = await runner({
				command: located.command,
				args: claudeArgs(request, settings),
				cwd: request.cwd,
				// Marks the agent as delegated, so a TOOLCODE started inside it won't delegate again.
				env: {...env(), [DEPTH_ENV]: String(delegationDepth(env()) + 1)},
				input: request.prompt,
				timeoutMs: request.timeoutMs,
				signal: request.signal,
			});
			const stream = parseStream(proc.stdout);
			const {status, note} = classify(proc, stream);
			const summary = [note, stream.result ?? (stream.parsed ? undefined : proc.stdout.trim() || undefined)].filter(Boolean).join('\n\n');
			return {
				status,
				exitCode: proc.exitCode,
				stdout: proc.stdout,
				stderr: proc.stderr,
				summary: summary || undefined,
				// Stream output names its tool calls; plain text output doesn't, so these stay unknown.
				commandsRun: stream.parsed ? stream.commandsRun : undefined,
				filesTouched: stream.parsed ? stream.filesTouched : undefined,
				permissionDenials: stream.parsed ? stream.permissionDenials : undefined,
				turns: stream.turns,
				costUsd: stream.costUsd,
			};
		},
	};
}
