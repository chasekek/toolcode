import type {CompletionRequest, ProviderEvent} from '../providers/types.js';
import type {JsonSchema, ToolContext} from '../tools/types.js';

/**
 * The public plugin API. A plugin is a JS file whose default export is a
 * `PluginDefinition`: plain objects, no imports required.
 */

export type {CompletionRequest, JsonSchema, ProviderEvent, ToolContext};

/** What a plugin tool's `run` may return: a string, or an object for control over the UI. */
export type PluginToolResult =
	| string
	| {
			/** Sent back to the model. */
			content: string;
			/** One line shown in the UI. Defaults to the first line of `content`. */
			summary?: string;
			/** Longer text shown with ctrl+o. Defaults to `content`. */
			output?: string;
			/** Mark the call as failed without throwing. */
			error?: boolean;
	  };

export interface PluginTool {
	/** Name the model calls: letters, digits, "_" or "-", up to 64 characters. */
	name: string;
	/** Tells the model what the tool does and when to use it. */
	description: string;
	/** JSON Schema for the arguments. Omit for a tool that takes none. */
	parameters?: JsonSchema;
	/** Name shown in the UI. Defaults to `name`. */
	label?: string;
	/** Set to true if the tool never changes anything; it then also runs in plan mode. */
	readOnly?: boolean;
	/** Summary of the arguments shown next to the label. Defaults to the first string argument. */
	describe?: (args: Record<string, any>) => string;
	/** Does the work. Throw an Error to report a failure to the model. */
	run: (args: Record<string, any>, ctx: ToolContext) => PluginToolResult | Promise<PluginToolResult>;
}

export interface PluginProvider {
	/** Unique id, used in "/model <id>:<model>". */
	id: string;
	/** Display name. Defaults to `id`. */
	name?: string;
	/** Models to offer: ids, or {id, label}. */
	models: Array<string | {id: string; label?: string}>;
	/** Environment variable with the API key. Omit if the provider needs no key. */
	apiKeyEnv?: string;
	/** Base URL of an OpenAI-compatible API (the part before /chat/completions). */
	baseUrl?: string;
	/** Extra HTTP headers for the OpenAI-compatible client. */
	headers?: Record<string, string>;
	/**
	 * Custom client for APIs that aren't OpenAI-compatible. Yield
	 * {type: 'text', delta} as text streams in and
	 * {type: 'tool_call', call: {id, name, arguments}} for each finished tool call.
	 */
	stream?: (request: CompletionRequest) => AsyncIterable<ProviderEvent>;
}

export interface PluginCommand {
	/** Typed as /name. Lowercase letters, digits and "-". */
	name: string;
	description: string;
	/** Argument hint shown in the menu, e.g. "[file]". */
	args?: string;
	/** Gets the text typed after the command. Return a string to show it as the reply. */
	run: (args: string, ctx: {cwd: string}) => unknown;
}

export interface PluginDefinition {
	/** Shown in /plugins and in error messages. Defaults to the file name. */
	name?: string;
	tools?: PluginTool[];
	providers?: PluginProvider[];
	commands?: PluginCommand[];
}

export interface LoadedPlugin {
	name: string;
	file: string;
	tools: string[];
	providers: string[];
	commands: string[];
}
