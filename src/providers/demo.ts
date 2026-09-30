import {AbortError} from '../core/abort.js';
import type {StreamEvent, TurnKind} from '../core/types.js';

/**
 * Stand-in for a real model stream so the UI can be exercised before the
 * OpenRouter client exists. It emits the same events a provider will.
 */

interface DemoOptions {
	kind: TurnKind;
	model: string;
	signal: AbortSignal;
	fail: boolean;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) return reject(new AbortError());
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(new AbortError());
		};
		signal.addEventListener('abort', onAbort, {once: true});
	});
}

/** Splits text into small word-ish chunks, like tokens arriving from a model. */
function tokenize(text: string): string[] {
	return text.match(/\s*\S{1,6}|\s+/g) ?? [];
}

const SAMPLE_FILE = `import {render} from 'ink';
import {App} from './ui/App.js';

const args = process.argv.slice(2);

if (args.includes('--version')) {
  console.log('TOOLCODE v0.0.1');
  process.exit(0);
}

render(<App />);`;

function script(kind: TurnKind, fullPrompt: string, model: string): Array<StreamEvent | {type: 'pause'; ms: number}> {
	const firstLine = fullPrompt.trim().split('\n')[0] ?? '';
	const prompt = firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
	const intro: Record<TurnKind, string> = {
		chat: `Got it. You asked: **${prompt}**\n\nLet me look at the entry point first.`,
		plan: `Here is a plan for: **${prompt}**\n\nI'll inspect the code before proposing changes.`,
		improve: `Looking for improvements${prompt ? ` focused on **${prompt}**` : ''}.`,
		judge: `Reviewing the previous answer.`,
	};

	const body: Record<TurnKind, string> = {
		chat: `The CLI entry point parses flags, then hands off to \`App\`.\n\n- \`--version\` exits early\n- everything else renders the UI\n\nThis is a **demo response** from \`${model}\`; set \`OPENROUTER_API_KEY\` to talk to a real model.`,
		plan: `## Plan\n\n1. Read the relevant files\n2. Outline the change\n3. Implement it in small steps\n4. Verify with a build\n\nPlan mode: no files will be changed.`,
		improve: `## Suggestions\n\n- Extract flag parsing into its own module\n- Add a \`--model\` flag to pick a model at startup\n- Handle \`SIGINT\` to restore the terminal cleanly`,
		judge: `## Verdict\n\n- Correctness: **good**\n- Clarity: **good**\n- Missing: tests for the edge cases\n\nScore: 8/10`,
	};

	const events: Array<StreamEvent | {type: 'pause'; ms: number}> = [];
	for (const t of tokenize(intro[kind])) events.push({type: 'text', delta: t});
	events.push({type: 'text', delta: '\n\n'});

	if (kind !== 'judge') {
		events.push({type: 'tool_start', call: {id: 't1', name: 'Read', args: 'src/cli.tsx'}});
		events.push({type: 'pause', ms: 700});
		events.push({
			type: 'tool_end',
			id: 't1',
			status: 'success',
			summary: `Read ${SAMPLE_FILE.split('\n').length} lines`,
			output: SAMPLE_FILE,
		});
	}

	for (const t of tokenize(body[kind])) events.push({type: 'text', delta: t});
	return events;
}

export async function* demoStream(prompt: string, options: DemoOptions): AsyncGenerator<StreamEvent> {
	await sleep(600, options.signal); // time to first token

	const events = script(options.kind, prompt, options.model);
	const failAt = options.fail ? Math.floor(events.length / 3) : -1;

	for (let i = 0; i < events.length; i++) {
		if (i === failAt) {
			throw new Error('OpenRouter returned 502 Bad Gateway (simulated). The upstream provider did not respond.');
		}
		const event = events[i]!;
		if (event.type === 'pause') {
			await sleep(event.ms, options.signal);
			continue;
		}
		await sleep(event.type === 'text' ? 18 + Math.random() * 30 : 120, options.signal);
		yield event;
	}
}
