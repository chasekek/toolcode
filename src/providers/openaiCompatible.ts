import type {CompletionRequest, ModelToolCall, ProviderEvent} from './types.js';

interface Options {
	name: string;
	baseUrl: string;
	headers?: Record<string, string>;
}

interface Delta {
	content?: string | null;
	tool_calls?: Array<{index: number; id?: string; function?: {name?: string; arguments?: string}}>;
}

interface Chunk {
	choices?: Array<{delta?: Delta}>;
	error?: {message?: string; code?: number | string};
}

async function describeFailure(response: Response): Promise<string> {
	const body = await response.text().catch(() => '');
	try {
		const parsed = JSON.parse(body) as Chunk;
		if (parsed.error?.message) return parsed.error.message;
	} catch {
		// not JSON; fall through to the raw body
	}
	return body.trim().slice(0, 300) || response.statusText;
}

/** Yields each `data:` payload of a server-sent event stream. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const decoder = new TextDecoder();
	const reader = body.getReader();
	let buffer = '';
	try {
		while (true) {
			const {done, value} = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, {stream: true});
			let newline;
			while ((newline = buffer.indexOf('\n')) !== -1) {
				const line = buffer.slice(0, newline).trim();
				buffer = buffer.slice(newline + 1);
				// Lines starting with ":" are keep-alive comments.
				if (line.startsWith('data:')) yield line.slice(5).trim();
			}
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * Streaming client for any OpenAI-compatible /chat/completions endpoint
 * (OpenRouter, OpenAI, local servers). Tool calls use the native `tools`
 * API, so the model never has to write tool markup into its text.
 */
export function openAICompatibleStream({name, baseUrl, headers}: Options) {
	return async function* stream(request: CompletionRequest): AsyncGenerator<ProviderEvent> {
		const response = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			signal: request.signal,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${request.apiKey}`,
				...headers,
			},
			body: JSON.stringify({
				model: request.model,
				messages: request.messages,
				stream: true,
				...(request.tools.length > 0 && {
					tools: request.tools.map(t => ({type: 'function', function: t})),
					tool_choice: 'auto',
				}),
			}),
		});

		if (!response.ok || !response.body) {
			throw new Error(`${name} returned ${response.status}: ${await describeFailure(response)}`);
		}

		// Tool call fragments arrive keyed by index and are stitched together here.
		const pending = new Map<number, ModelToolCall>();

		for await (const data of sseData(response.body)) {
			if (data === '[DONE]') break;
			let chunk: Chunk;
			try {
				chunk = JSON.parse(data) as Chunk;
			} catch {
				continue;
			}
			if (chunk.error) throw new Error(`${name} error: ${chunk.error.message ?? 'unknown error'}`);

			const delta = chunk.choices?.[0]?.delta;
			if (!delta) continue;
			if (delta.content) yield {type: 'text', delta: delta.content};
			for (const fragment of delta.tool_calls ?? []) {
				const call = pending.get(fragment.index) ?? {id: '', name: '', arguments: ''};
				if (fragment.id) call.id = fragment.id;
				if (fragment.function?.name) call.name += fragment.function.name;
				if (fragment.function?.arguments) call.arguments += fragment.function.arguments;
				pending.set(fragment.index, call);
			}
		}

		for (const [index, call] of [...pending].sort(([a], [b]) => a - b)) {
			yield {type: 'tool_call', call: {...call, id: call.id || `call_${index}`}};
		}
	};
}
