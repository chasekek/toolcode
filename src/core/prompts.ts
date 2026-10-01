import type {DelegationIntent} from '../agents/intent.js';
import {enabledAgents} from '../agents/registry.js';
import type {Tool} from '../tools/types.js';
import type {TurnKind} from './types.js';
import {listFiles} from './workspace.js';

/** Turn kinds that only look at the code; they get read-only tools. */
export function isReadOnlyTurn(kind: TurnKind): boolean {
	return kind !== 'chat';
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ToolHints {
	/** Tools the user named with @name: they asked for these outright. */
	requested: Tool[];
	/** Tools whose keywords the message uses, grouped by keyword. */
	suggested: Array<{keyword: string; tools: Tool[]}>;
}

/**
 * Which tools the user's words point at. "@jev_judge" names a tool outright;
 * "judge whether..." matches the keyword "judge" (also "judging", "judged").
 * A /judge turn counts as saying "judge".
 */
export function toolHints(kind: TurnKind, input: string, tools: Tool[]): ToolHints {
	const text = kind === 'judge' ? `judge ${input}` : input;
	const requested = tools.filter(t => new RegExp(`(^|[^\\w-])@${escapeRegExp(t.name)}(?![\\w-])`, 'i').test(text));
	const suggested: ToolHints['suggested'] = [];
	for (const tool of tools) {
		if (requested.includes(tool)) continue;
		for (const keyword of tool.keywords ?? []) {
			// "judge" should also catch "judging": a trailing "e" drops before "-ing".
			const stem = keyword.endsWith('e') ? `(?:${escapeRegExp(keyword)}|${escapeRegExp(keyword.slice(0, -1))}ing)` : escapeRegExp(keyword);
			if (!new RegExp(`\\b${stem}`, 'i').test(text)) continue;
			const group = suggested.find(g => g.keyword === keyword);
			if (group) group.tools.push(tool);
			else suggested.push({keyword, tools: [tool]});
			break;
		}
	}
	return {requested, suggested};
}

export interface PromptOptions {
	/** Orchestrator mode: coordinate delegated agents rather than code. */
	orchestrator?: boolean;
	/** What the user's message says about delegation. */
	intent?: DelegationIntent;
}

/** Rules for the delegation tools; empty when they aren't offered this turn. */
export function delegationRules(tools: Tool[], options: PromptOptions): string[] {
	const names = new Set(tools.map(t => t.name));
	if (!names.has('delegate')) {
		return options.intent?.forbid ? ['The user asked you to do this yourself: do not hand it to another agent.'] : [];
	}
	const available = enabledAgents().map(a => `${a.id} (${a.name}: ${a.description})`).join('; ');
	const rules = [
		`You can hand work to other coding agents with delegate. Agents: ${available}.`,
		'Delegate when another agent would clearly do the work better: large refactors, multi-file features, hard debugging, repository-wide changes, fixing failing tests, or work that needs shell commands you cannot run. Do simple edits, small fixes and plain questions yourself; delegation is slow.',
		'A delegated agent does not see this conversation. Give it a complete task: the goal, the relevant files, the context and decisions so far, constraints, and what done means.',
		'You stay responsible for the result. After a delegation, read the files it reports as changed (the workspace, not its summary, is the truth) before telling the user the work is done.',
		'If a delegation fails, look at why: fix the task description and retry once, do the work yourself, or ask the user. Never repeat the same delegation more than twice.',
	];
	const intent = options.intent;
	if (intent?.require) {
		rules.push(
			`The user explicitly asked for ${intent.agent ? intent.agent.name : 'a delegated agent'}: use ${names.has('delegate_tasks') ? 'delegate or delegate_tasks' : 'delegate'}${intent.agent ? ` with agent "${intent.agent.id}"` : ''} for this work rather than doing it yourself or explaining how.`,
		);
	}
	if (intent?.noParallel) rules.push('The user wants one agent at a time: run delegated tasks one after another, never in parallel.');
	return rules;
}

/** Orchestrator mode's role description, which replaces the default coder framing. */
export function orchestratorRules(tools: Tool[]): string[] {
	if (!tools.some(t => t.name === 'delegate_tasks')) return [];
	return [
		'Orchestrator mode is on. Your main job is to coordinate work done by delegated coding agents, not to write all the code yourself.',
		'For a substantial request: understand the goal, split it into subtasks, assign each to a suitable agent, and run them with delegate_tasks (several tasks with depends_on) or delegate (one task). Do small integration fixes yourself.',
		'In delegate_tasks, list depends_on for any task that needs the output of another (tests after the code they test), and list the files each task will change so independent tasks can run in parallel without editing the same files.',
		'When results come back: check the changed files, resolve conflicts between tasks, create follow-up tasks for failures (e.g. delegate the debugging of a failing test), then give the user a short report of what was done and verified.',
		'Do not delegate trivial work, and do not narrate your internal plan at length; the user wants the outcome.',
	];
}

export function systemPrompt(kind: TurnKind, cwd: string, tools: Tool[], input = '', options: PromptOptions = {}): string {
	const {files, truncated} = listFiles(cwd);
	const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

	const rules = [
		'Use the provided tools through function calling. Never write tool names, JSON arguments or markup such as <write_file> or <read_file> in your reply text; the interface already shows each tool call to the user.',
		'Paths are relative to the workspace root. You cannot touch files outside it.',
		'Read a file before changing it, and preserve the parts you are not changing.',
		'write_file replaces the whole file: always send the complete new contents, never a snippet, diff or placeholder like "rest unchanged".',
		'Keep replies short and concrete. After changing files, summarize what changed in a sentence or two.',
	];
	if (tools.some(t => t.name === 'todo_write')) {
		rules.push('For work with several steps, track it with todo_write and keep the list current as you go.');
	}
	if (tools.some(t => t.name === 'ask')) {
		rules.push('If the request is ambiguous or a choice is the user\'s to make, use ask instead of guessing. Never ask what you can find out by reading files.');
	}
	if (isReadOnlyTurn(kind)) {
		rules.push('This turn is read-only: inspect files as needed, but do not try to create, edit or delete anything.');
	}
	if (kind === 'plan') {
		rules.push('Plan mode is on: reply with a numbered, step-by-step plan naming the files involved.');
	}
	rules.push(...orchestratorRules(tools), ...delegationRules(tools, options));
	const {requested, suggested} = toolHints(kind, input, tools);
	if (requested.length > 0) {
		rules.push(`The user asked for ${requested.map(t => t.name).join(', ')} by name: use ${requested.length > 1 ? 'them' : 'it'} for this request.`);
	}
	for (const {keyword, tools: matched} of suggested) {
		const names = matched.map(t => t.name).join(' or ');
		rules.push(
			`The user's message says "${keyword}", and ${names} ${matched.length > 1 ? 'are' : 'is'} built for that. ` +
				'Decide for yourself whether calling it would help here; if it would, call it rather than answering from your own judgement alone' +
				(matched.length > 1 ? ', and pick whichever fits (one that is not set up says so).' : '.'),
		);
	}

	const role = tools.some(t => t.name === 'delegate_tasks')
		? "You are TOOLCODE in orchestrator mode, running in the user's terminal. You manage the work on the project in the workspace below: you plan it, hand subtasks to delegated coding agents, and check and integrate what they produce."
		: "You are TOOLCODE, a coding agent running in the user's terminal. You work on the project in the workspace below by reading and writing its files.";

	return `${role}

Workspace: ${cwd}
Platform: ${process.platform}

Tools:
${toolList}

Rules:
${rules.map(r => `- ${r}`).join('\n')}

Files in the workspace${truncated ? ` (first ${files.length})` : ''}:
${files.length > 0 ? files.join('\n') : '(empty)'}`;
}

/** The user message sent to the model for a turn. */
export function userPrompt(kind: TurnKind, input: string): string {
	switch (kind) {
		case 'chat':
		case 'plan':
			return input;
		case 'improve':
			return `Suggest concrete improvements to this project${input ? `, focusing on: ${input}` : ''}. Read the relevant files first, then give a prioritized list.`;
		case 'judge':
			return 'Critically evaluate your previous response for correctness, completeness and clarity. Point out mistakes or gaps, then give a score out of 10.';
	}
}
