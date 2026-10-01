import os from 'node:os';
import {agentConfig, canDelegate, configFile, delegationDepth, loadConfig} from './config.js';
import {agents} from './registry.js';

/** A status report for /agents and /orchestrate: which agents can run, and with what settings. */
export async function describeAgents(orchestrator?: boolean): Promise<{available: boolean; text: string}> {
	const config = loadConfig();
	const file = configFile().replace(os.homedir(), '~');
	const lines: string[] = [];
	if (!canDelegate(config)) {
		lines.push(`Delegation is off: this TOOLCODE runs inside a delegated agent (depth ${delegationDepth()}).`);
		return {available: false, text: lines.join('\n')};
	}
	let available = false;
	for (const agent of agents) {
		const settings = agentConfig(agent.id, config);
		if (!settings.enabled) {
			lines.push(`${agent.name}: disabled in ${file}`);
			continue;
		}
		const found = await agent.detect();
		available ||= found.available;
		lines.push(
			found.available
				? `${agent.name}: available${found.version ? ` (${found.version.replace(/\s*\(.*\)$/, '')})` : ''}`
				: `${agent.name}: unavailable. ${found.reason ?? ''} Set agents.${agent.id}.command in ${file} if it is installed elsewhere.`,
		);
		lines.push(`  commands ${settings.commands} · timeout ${settings.timeoutMinutes} min · default mode ${settings.defaultMode}`);
	}
	const {maxParallel, maxRetries} = config.orchestrator;
	if (orchestrator !== undefined) lines.push(`Orchestrator mode: ${orchestrator ? 'on' : 'off'} (/orchestrate toggles it)`);
	lines.push(`Up to ${maxParallel} agents in parallel, ${maxRetries} retr${maxRetries === 1 ? 'y' : 'ies'} per failed task.`);
	return {available, text: lines.join('\n')};
}
