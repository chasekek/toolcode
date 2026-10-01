import type {AgentProvider} from './types.js';

/** What the user's own words say about delegation for this message. */
export interface DelegationIntent {
	/** They asked for a delegated agent: "use Claude Code", "delegate this". */
	require: boolean;
	/** They asked TOOLCODE to do it itself: "don't delegate", "do it yourself". */
	forbid: boolean;
	/** They asked for one agent at a time: "don't use parallel agents". */
	noParallel: boolean;
	/** The agent they named, if any. */
	agent?: AgentProvider;
}

const FORBID =
	/\b(?:don'?t|do not|never|no need to|without)\s+(?:delegat\w*|us(?:e|ing)\s+(?:a\s+|any\s+)?(?:sub-?agents?|other\s+(?:ai\s+)?(?:agents?|clis?)|another\s+(?:ai\s+)?(?:agent|cli)))\b|\bdo\s+(?:it|this|that)\s+(?:yourself|on your own)\b|\bno\s+delegation\b/i;
const REQUIRE =
	/\bdelegat\w*\b|\b(?:as\s+an?|use\s+an?|via\s+an?|with\s+an?)\s+sub-?agents?\b|\b(?:use|have|let|get|ask)\s+(?:an)?other\s+(?:ai\s+)?(?:cli|agent|coding agent)\b/i;
const NO_PARALLEL = /\b(?:don'?t|do not|no|never)\s+(?:use\s+|run\s+)?(?:parallel|concurrent)\w*|\bone at a time\b|\bsequentially\b/i;

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads explicit delegation instructions from a message. Naming an agent with a
 * verb ("use Claude Code", "have Claude Code fix it") counts as asking for it;
 * "do it yourself" or "don't delegate" overrides everything else.
 */
export function delegationIntent(input: string, agents: AgentProvider[]): DelegationIntent {
	const noParallel = NO_PARALLEL.test(input);
	if (FORBID.test(input)) return {require: false, forbid: true, noParallel};
	let agent: AgentProvider | undefined;
	for (const candidate of agents) {
		const names = [candidate.name.toLowerCase(), ...candidate.aliases].map(escape).join('|');
		const asked = new RegExp(`\\b(?:use|using|have|let|get|ask|via|with|to|through)\\s+(?:the\\s+)?(?:${names})\\b|\\b(?:${names})\\s+(?:should|can|could|will|to)\\b`, 'i');
		if (asked.test(input)) {
			agent = candidate;
			break;
		}
	}
	return {require: agent !== undefined || REQUIRE.test(input), forbid: false, noParallel, agent};
}
