import type {Message, ToolCall} from '../core/types.js';

/** Every tool call in the transcript, oldest first. */
export function toolCalls(messages: Message[]): ToolCall[] {
	const calls: ToolCall[] = [];
	for (const message of messages) {
		if (message.role !== 'assistant') continue;
		for (const part of message.parts) if (part.type === 'tool') calls.push(part.call);
	}
	return calls;
}

export type FileStatus = 'A' | 'M' | 'D';

export interface FileChange {
	path: string;
	status: FileStatus;
	/** Net lines added (+) or removed (-) this session, when the summaries say. */
	delta: number | null;
	/** The latest successful call that touched the file. */
	call: ToolCall;
}

// Labels of the built-in file tools, as they appear on tool calls.
const WRITE = 'Write';
const DELETE = 'Delete';

function normalize(file: string): string {
	return file.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Lines a write added according to its summary: "Created file (42 lines)" or "Edited file (9 lines, -3)". */
function lineDelta(summary: string | undefined): number | null {
	const created = /^Created file \((\d+) lines?\)/.exec(summary ?? '');
	if (created) return Number(created[1]);
	const edited = /^Edited file \(\d+ lines?(?:, ([+-]\d+))?\)/.exec(summary ?? '');
	if (edited) return edited[1] ? Number(edited[1]) : 0;
	return null;
}

/**
 * Files the agent changed this session, in the order they were first
 * touched. A file created and then deleted again drops out entirely.
 */
export function changedFiles(messages: Message[]): FileChange[] {
	const files = new Map<string, FileChange>();
	for (const call of toolCalls(messages)) {
		if (call.status !== 'success' || !call.args || (call.name !== WRITE && call.name !== DELETE)) continue;
		const path = normalize(call.args);
		const previous = files.get(path);
		if (call.name === DELETE) {
			if (previous?.status === 'A') files.delete(path);
			else files.set(path, {path, status: 'D', delta: null, call});
			continue;
		}
		const delta = lineDelta(call.summary);
		const created = call.summary?.startsWith('Created') ?? false;
		const status: FileStatus = previous?.status === 'A' || (created && previous?.status !== 'D') ? 'A' : 'M';
		const total = delta === null ? (previous?.delta ?? null) : (previous?.delta ?? 0) + delta;
		files.set(path, {path, status, delta: total, call});
	}
	return [...files.values()];
}
