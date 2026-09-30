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

export interface HelpMessage {
	id: string;
	role: 'help';
}

export type Message = UserMessage | AssistantMessage | NoticeMessage | HelpMessage;

/** Events emitted by a streaming model response. */
export type StreamEvent =
	| {type: 'text'; delta: string}
	| {type: 'tool_start'; call: Pick<ToolCall, 'id' | 'name' | 'args'>}
	| {type: 'tool_end'; id: string; status: Exclude<ToolStatus, 'running'>; summary: string; output?: string};

export type Mode = 'default' | 'plan';

/** What kind of turn produced a request; commands like /judge reuse the chat pipeline. */
export type TurnKind = 'chat' | 'plan' | 'improve' | 'judge';

export interface Settings {
	unicode: boolean;
	expandTools: boolean;
	simulateErrors: boolean;
}
