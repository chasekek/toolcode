import {delegationIntent} from '../agents/intent.js';
import {agents} from '../agents/registry.js';
import type {ChatMessage, ModelToolCall, Provider} from '../providers/types.js';
import {getTool, toolsFor} from '../tools/registry.js';
import {resolveInWorkspace} from '../tools/paths.js';
import type {AskQuestion, Session, ToolResult, TurnOptions} from '../tools/types.js';
import {AbortError} from './abort.js';
import {isReadOnlyTurn, systemPrompt, userPrompt} from './prompts.js';
import type {StreamEvent, TurnKind} from './types.js';

/** Safety stop so a confused model can't loop forever. */
const MAX_STEPS = 40;

export interface AgentTurn {
	provider: Provider;
	apiKey: string;
	model: string;
	cwd: string;
	kind: TurnKind;
	input: string;
	/**
	 * The model-facing conversation. The turn appends to it, and only ever
	 * leaves it in a state the API accepts (every tool call has a result).
	 */
	history: ChatMessage[];
	signal: AbortSignal;
	/** Conversation state shared by tools (e.g. todos). A fresh one is used if omitted. */
	session?: Session;
	/** Lets the ask tool reach the user; omitted when there is no interactive UI. */
	ask?: (questions: AskQuestion[]) => Promise<string[] | null>;
	/** Orchestrator mode: coordinate delegated agents instead of doing all the work directly. */
	orchestrator?: boolean;
}

function parseArgs(raw: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(raw.trim() || '{}');
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Arguments must be a JSON object.');
	return parsed as Record<string, unknown>;
}

function failure(error: unknown): ToolResult {
	const message = error instanceof Error ? error.message : String(error);
	return {status: 'error', summary: message, content: `Error: ${message}`};
}

/**
 * Runs one user turn: stream the model's reply, execute any tool calls it
 * makes, feed the results back, and repeat until it answers without tools.
 * Emits the same events the UI renders, so any provider or tool plugs in.
 */
export async function* runAgent(turn: AgentTurn): AsyncGenerator<StreamEvent> {
	const {provider, history, signal, cwd} = turn;
	const session = turn.session ?? {todos: []};
	const intent = delegationIntent(turn.input, agents);
	const options: TurnOptions = {orchestrator: turn.orchestrator === true, parallel: !intent.noParallel};
	// "Do it yourself" is honoured by not offering delegation at all, not by asking nicely.
	const tools = toolsFor(isReadOnlyTurn(turn.kind), options).filter(t => !(intent.forbid && t.delegation));
	const specs = tools.map(({name, description, parameters}) => ({name, description, parameters}));
	history.push({role: 'user', content: userPrompt(turn.kind, turn.input)});

	for (let step = 0; step < MAX_STEPS; step++) {
		let text = '';
		const calls: ModelToolCall[] = [];

		try {
			const stream = provider.stream({
				model: turn.model,
				apiKey: turn.apiKey,
				messages: [{role: 'system', content: systemPrompt(turn.kind, cwd, tools, turn.input, {orchestrator: options.orchestrator, intent})}, ...history],
				tools: specs,
				signal,
			});
			for await (const event of stream) {
				if (event.type === 'text') {
					text += event.delta;
					yield event;
				} else {
					calls.push(event.call);
				}
			}
		} catch (error) {
			// Keep what the user already saw so the model knows it was cut off.
			if (text) history.push({role: 'assistant', content: `${text}\n\n[response interrupted]`});
			throw error;
		}

		history.push({
			role: 'assistant',
			content: text || null,
			...(calls.length > 0 && {
				tool_calls: calls.map(c => ({id: c.id, type: 'function' as const, function: {name: c.name, arguments: c.arguments}})),
			}),
		});
		if (calls.length === 0) return;

		for (const call of calls) {
			const tool = getTool(call.name);
			let args: Record<string, unknown> = {};
			let result: ToolResult | undefined;
			try {
				args = parseArgs(call.arguments);
			} catch (error) {
				result = failure(new Error(`Invalid arguments for ${call.name}: ${(error as Error).message}`));
			}

			yield {type: 'tool_start', call: {id: call.id, name: tool?.label ?? call.name, args: tool?.describe(args) ?? ''}};

			if (signal.aborted) {
				result = {status: 'error', summary: 'Cancelled', content: 'Cancelled by the user.'};
			} else if (!result) {
				if (!tool || !tools.includes(tool)) {
					result = failure(new Error(`Tool "${call.name}" is not available${tool ? ' in this read-only turn' : ''}.`));
				} else {
					try {
						result = await tool.run(args, {cwd, signal, session, ask: turn.ask, turn: options, resolvePath: file => resolveInWorkspace(cwd, file)});
					} catch (error) {
						result = failure(error);
					}
				}
			}

			history.push({role: 'tool', tool_call_id: call.id, content: result.content});
			yield {type: 'tool_end', id: call.id, status: result.status, summary: result.summary, output: result.output};
		}

		if (signal.aborted) throw new AbortError();
	}

	yield {type: 'text', delta: `\n\nStopped after ${MAX_STEPS} steps. Send a message to continue.`};
}
