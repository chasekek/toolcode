import type {Tool} from '../tools/types.js';
import type {TurnKind} from './types.js';
import {listFiles} from './workspace.js';

/** Turn kinds that only look at the code; they get read-only tools. */
export function isReadOnlyTurn(kind: TurnKind): boolean {
	return kind !== 'chat';
}

export function systemPrompt(kind: TurnKind, cwd: string, tools: Tool[]): string {
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

	return `You are TOOLCODE, a coding agent running in the user's terminal. You work on the project in the workspace below by reading and writing its files.

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
