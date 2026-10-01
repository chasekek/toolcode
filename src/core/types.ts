export type ToolStatus = 'running' | 'success' | 'error';

export interface ToolCall {
	id: string;
	name: string;
	/** One-line summary of the arguments, shown next to the tool name. */
	args: string;
	status: ToolStatus;
	/** Short result summary, e.g. "Read 86 lines". */
	summary?: string;
	output?: string;
	/** Epoch ms, stamped by the UI as events arrive. */
	startedAt?: number;
	endedAt?: number;
}

export type Part = {type: 'text'; text: string} | {type: 'tool'; call: ToolCall};

export type AssistantStatus = 'streaming' | 'done' | 'interrupted' | 'error';

export interface UserMessage {
	id: string;
	role: 'user';
	text: string;
}

export interface AssistantMessage {
	id: string;
	role: 'assistant';
	parts: Part[];
	status: AssistantStatus;
	model: string;
	error?: string;
}

export type NoticeLevel = 'info' | 'success' | 'warning' | 'error';

export interface NoticeMessage {
	id: string;
	role: 'notice';
	level: NoticeLevel;
	text: string;
}

export type Message = UserMessage | AssistantMessage | NoticeMessage;

/** Events emitted by a streaming model response. */
export type StreamEvent =
	| {type: 'text'; delta: string}
	| {type: 'tool_start'; call: Pick<ToolCall, 'id' | 'name' | 'args'>}
	| {type: 'tool_end'; id: string; status: Exclude<ToolStatus, 'running'>; summary: string; output?: string};

/** plan: read-only planning; orchestrate: coordinate delegated agents. */
export type Mode = 'default' | 'plan' | 'orchestrate';

/** What kind of turn produced a request; commands like /judge reuse the chat pipeline. */
export type TurnKind = 'chat' | 'plan' | 'improve' | 'judge';

export interface Settings {
	unicode: boolean;
	expandTools: boolean;
	simulateErrors: boolean;
	/** Wheel scrolling and click-to-focus; terminals then need shift+drag to select text. */
	mouse?: boolean;
}
