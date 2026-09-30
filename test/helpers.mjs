import {mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runAgent} from '../dist/core/agent.js';

export function tempDir() {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'toolcode-test-'));
	return {dir, cleanup: () => rmSync(dir, {recursive: true, force: true})};
}

/** Provider that replays scripted steps: each step is a list of tool calls, or a string reply. */
export function scriptedProvider(steps) {
	const requests = [];
	let i = 0;
	return {
		requests,
		provider: {
			id: 'scripted',
			name: 'Scripted',
			models: [{id: 'm', label: 'm'}],
			async *stream(request) {
				requests.push(request);
				const step = steps[i++] ?? 'done';
				if (typeof step === 'string') {
					yield {type: 'text', delta: step};
					return;
				}
				for (const [n, call] of step.entries()) {
					yield {type: 'tool_call', call: {id: `c${i}_${n}`, name: call.name, arguments: JSON.stringify(call.args ?? {})}};
				}
			},
		},
	};
}

/** Runs one agent turn and collects the emitted events. */
export async function runTurn({provider, cwd, kind = 'chat', input = 'go', history = [], signal, ...rest}) {
	const events = [];
	for await (const event of runAgent({provider, apiKey: '', model: 'm', cwd, kind, input, history, signal: signal ?? new AbortController().signal, ...rest})) {
		events.push(event);
	}
	return {events, history, toolEnds: events.filter(e => e.type === 'tool_end')};
}
