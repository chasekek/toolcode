import {existsSync, readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {AgentMode} from './types.js';

/** How a delegated agent may get permission to run shell commands. */
export type CommandPolicy = 'ask' | 'allow' | 'deny';

export interface AgentConfig {
	enabled: boolean;
	/** Executable to run instead of the one found on PATH. */
	command?: string;
	timeoutMinutes: number;
	/** Used when the model doesn't say whether the agent may edit. */
	defaultMode: AgentMode;
	/** "ask" shows the user a prompt each time the model wants commands; "deny" never allows them. */
	commands: CommandPolicy;
	/** Passed to the agent's own model flag, e.g. "sonnet". */
	model?: string;
}

export interface DelegationConfig {
	agents: Record<string, AgentConfig>;
	orchestrator: {
		/** Start in orchestrator mode, as with --orchestrator. */
		enabled: boolean;
		/** Delegated tasks that may run at once in a delegate_tasks batch. */
		maxParallel: number;
		/** Extra attempts for a failed task before giving up on it. */
		maxRetries: number;
	};
	/**
	 * How deep delegation may nest. TOOLCODE sets TOOLCODE_DELEGATION_DEPTH for the
	 * agents it starts; at this depth the delegation tools are not offered at all.
	 */
	maxDepth: number;
}

export const DEFAULT_AGENT: AgentConfig = {enabled: true, timeoutMinutes: 20, defaultMode: 'implement', commands: 'ask'};

export const DEPTH_ENV = 'TOOLCODE_DELEGATION_DEPTH';

/** The user's settings file. Read on each call so tests can point it elsewhere. */
export function configFile(): string {
	return process.env['TOOLCODE_CONFIG_FILE'] || path.join(os.homedir(), '.toolcode', 'config.json');
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

function readAgent(raw: unknown): AgentConfig {
	const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	return {
		enabled: item['enabled'] !== false,
		command: typeof item['command'] === 'string' && item['command'].trim() ? item['command'].trim() : undefined,
		timeoutMinutes: clampInt(item['timeoutMinutes'], 1, 240, DEFAULT_AGENT.timeoutMinutes),
		defaultMode: item['defaultMode'] === 'investigate' ? 'investigate' : 'implement',
		commands: item['commands'] === 'allow' || item['commands'] === 'deny' ? item['commands'] : 'ask',
		model: typeof item['model'] === 'string' && item['model'].trim() ? item['model'].trim() : undefined,
	};
}

/**
 * Delegation settings from ~/.toolcode/config.json. A missing or broken file
 * means the defaults: delegation on, commands only with the user's say-so.
 */
export function loadConfig(): DelegationConfig {
	let raw: Record<string, unknown> = {};
	const file = configFile();
	if (existsSync(file)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
			if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
		} catch {
			// Treated as empty, like the auth and preferences files.
		}
	}
	const agents: Record<string, AgentConfig> = {};
	const rawAgents = raw['agents'] && typeof raw['agents'] === 'object' ? (raw['agents'] as Record<string, unknown>) : {};
	for (const [id, value] of Object.entries(rawAgents)) agents[id] = readAgent(value);
	const orchestrator = (raw['orchestrator'] && typeof raw['orchestrator'] === 'object' ? raw['orchestrator'] : {}) as Record<string, unknown>;
	return {
		agents,
		orchestrator: {
			enabled: orchestrator['enabled'] === true,
			maxParallel: clampInt(orchestrator['maxParallel'], 1, 8, 3),
			maxRetries: clampInt(orchestrator['maxRetries'], 0, 3, 1),
		},
		maxDepth: clampInt(raw['maxDepth'], 0, 3, 1),
	};
}

export function agentConfig(id: string, config: DelegationConfig = loadConfig()): AgentConfig {
	return config.agents[id] ?? DEFAULT_AGENT;
}

/** How many delegations deep this process is: 0 when the user started it. */
export function delegationDepth(env: NodeJS.ProcessEnv = process.env): number {
	const depth = Number(env[DEPTH_ENV]);
	return Number.isInteger(depth) && depth > 0 ? depth : 0;
}

/** Whether this process may delegate at all, which is what stops agent → TOOLCODE → agent chains. */
export function canDelegate(config: DelegationConfig = loadConfig(), env: NodeJS.ProcessEnv = process.env): boolean {
	return delegationDepth(env) < config.maxDepth;
}
