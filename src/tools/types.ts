import type {Todo} from '../core/todos.js';

/** JSON Schema for a tool's arguments, sent to the model as-is. */
export interface JsonSchema {
	type: 'object';
	properties: Record<string, object>;
	required?: string[];
	additionalProperties?: boolean;
}

export interface AskQuestion {
	question: string;
	/** Choices to pick from; the user can always type their own answer instead. */
	options?: string[];
	/** The option to preselect and mark as recommended. */
	recommended?: string;
	/** Extra lines shown above the options, e.g. a snippet or a trade-off. */
	context?: string;
}

/** State that lives for the whole conversation and resets on /clear. */
export interface Session {
	todos: Todo[];
}

export interface ToolContext {
	/** Workspace root; tools may not touch files outside it. */
	cwd: string;
	signal: AbortSignal;
	/** Resolves a path against the workspace; throws if it points outside. */
	resolvePath(file: string): string;
	session: Session;
	/**
	 * Shows questions to the user and resolves with one answer per question,
	 * or null if they skipped. Undefined when there is no interactive UI.
	 */
	ask?: (questions: AskQuestion[]) => Promise<string[] | null>;
}

export interface ToolResult {
	status: 'success' | 'error';
	/** Short line shown in the UI, e.g. "Edited file (42 lines)". */
	summary: string;
	/** Longer output revealed with ctrl+o. */
	output?: string;
	/** What the model receives as the tool result. */
	content: string;
}

/**
 * A capability the model can invoke. Each tool lives in its own module and is
 * listed in the registry; the agent loop and UI never special-case a tool.
 */
export interface Tool {
	/** Name the model calls, e.g. "write_file". */
	name: string;
	/** Name shown in the UI, e.g. "Write". */
	label: string;
	description: string;
	parameters: JsonSchema;
	/** Read-only tools are the only ones offered in plan mode. */
	readOnly: boolean;
	/** One-line argument summary shown next to the label. */
	describe(args: Record<string, unknown>): string;
	run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
