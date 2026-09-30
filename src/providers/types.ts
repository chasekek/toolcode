import type {JsonSchema} from '../tools/types.js';

export interface ModelInfo {
	id: string;
	label: string;
}

/** A tool call as the model requested it; `arguments` is a JSON string. */
export interface ModelToolCall {
	id: string;
	name: string;
	arguments: string;
}

/** Conversation messages in the OpenAI chat format most providers accept. */
export type ChatMessage =
	| {role: 'system'; content: string}
	| {role: 'user'; content: string}
	| {role: 'assistant'; content: string | null; tool_calls?: Array<{id: string; type: 'function'; function: {name: string; arguments: string}}>}
	| {role: 'tool'; tool_call_id: string; content: string};

export interface ToolSpec {
	name: string;
	description: string;
	parameters: JsonSchema;
}

export interface CompletionRequest {
	model: string;
	apiKey: string;
	messages: ChatMessage[];
	tools: ToolSpec[];
	signal: AbortSignal;
}

/** Events from one model completion. Tool calls arrive whole, once their arguments finish streaming. */
export type ProviderEvent = {type: 'text'; delta: string} | {type: 'tool_call'; call: ModelToolCall};

/**
 * A model provider TOOLCODE can talk to. Every provider is described by the
 * same shape so new ones can be added to the registry without touching the UI.
 */
export interface Provider {
	id: string;
	name: string;
	/** Environment variable holding the API key; omit for providers that need none (e.g. local servers). */
	apiKeyEnv?: string;
	baseUrl?: string;
	models: ModelInfo[];
	stream(request: CompletionRequest): AsyncGenerator<ProviderEvent>;
}
