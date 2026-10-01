import {createClaudeCode} from './claudeCode.js';
import {agentConfig, canDelegate, loadConfig, type DelegationConfig} from './config.js';
import type {AgentProvider} from './types.js';

/** Built-in agents first. Module-scoped like the tool and provider registries. */
export const agents: AgentProvider[] = [createClaudeCode()];

export function registerAgent(agent: AgentProvider): void {
	if (getAgent(agent.id)) throw new Error(`An agent with id "${agent.id}" already exists.`);
	agents.push(agent);
}

export function unregisterAgent(id: string): void {
	const index = agents.findIndex(a => a.id === id);
	if (index !== -1) agents.splice(index, 1);
}

export function getAgent(id: string): AgentProvider | undefined {
	return agents.find(a => a.id === id);
}

/** Agents the user hasn't switched off in config. Says nothing about whether they're installed. */
export function enabledAgents(config: DelegationConfig = loadConfig()): AgentProvider[] {
	return agents.filter(a => agentConfig(a.id, config).enabled);
}

/** Whether the delegation tools should be offered this turn. Cheap: no process is started. */
export function delegationAvailable(config: DelegationConfig = loadConfig()): boolean {
	return canDelegate(config) && enabledAgents(config).length > 0;
}

/** Finds an agent by id, name or alias, e.g. "claude-code" or "Claude Code". */
export function findAgent(query: string): AgentProvider | undefined {
	const q = query.trim().toLowerCase();
	return agents.find(a => a.id === q || a.name.toLowerCase() === q || a.aliases.includes(q));
}
