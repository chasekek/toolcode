import {openAICompatibleStream} from '../providers/openaiCompatible.js';
import type {Provider} from '../providers/types.js';
import type {Tool, ToolResult} from '../tools/types.js';
import type {RegisteredCommand} from '../core/commands.js';
import type {PluginCommand, PluginProvider, PluginTool, PluginToolResult} from './types.js';

const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

function firstLine(text: string, max = 100): string {
	const line = text.trim().split('\n')[0] ?? '';
	return line.length > max ? `${line.slice(0, max - 1)}…` : line || 'Done';
}

function toResult(value: PluginToolResult): ToolResult {
	if (typeof value === 'string') {
		return {status: 'success', summary: firstLine(value), output: value, content: value};
	}
	if (!value || typeof value.content !== 'string') {
		throw new Error('Tool returned neither a string nor an object with a "content" string.');
	}
	return {
		status: value.error ? 'error' : 'success',
		summary: value.summary ?? firstLine(value.content),
		output: value.output ?? value.content,
		content: value.content,
	};
}

/** Fills in defaults so a plugin tool can be as small as {name, description, run}. */
export function normalizeTool(def: PluginTool): Tool {
	if (!def || typeof def !== 'object') throw new Error('Tool must be an object.');
	if (typeof def.name !== 'string' || !TOOL_NAME.test(def.name)) {
		throw new Error(`Tool name "${String(def.name)}" must be 1-64 letters, digits, "_" or "-".`);
	}
	if (typeof def.description !== 'string' || !def.description) throw new Error(`Tool "${def.name}" needs a description.`);
	if (typeof def.run !== 'function') throw new Error(`Tool "${def.name}" needs a run(args, ctx) function.`);

	return {
		name: def.name,
		label: def.label ?? def.name,
		description: def.description,
		parameters: def.parameters ?? {type: 'object', properties: {}},
		readOnly: def.readOnly ?? false,
		describe: args => {
			if (def.describe) return String(def.describe(args) ?? '');
			const first = Object.values(args).find(v => typeof v === 'string');
			return typeof first === 'string' ? firstLine(first, 60) : '';
		},
		run: async (args, ctx) => toResult(await def.run(args, ctx)),
	};
}

/** Fills in defaults; providers with only a baseUrl get the OpenAI-compatible client. */
export function normalizeProvider(def: PluginProvider): Provider {
	if (!def || typeof def !== 'object') throw new Error('Provider must be an object.');
	if (typeof def.id !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(def.id)) {
		throw new Error(`Provider id "${String(def.id)}" must use letters, digits, ".", "_" or "-".`);
	}
	if (!Array.isArray(def.models) || def.models.length === 0) throw new Error(`Provider "${def.id}" needs at least one model.`);

	const name = def.name ?? def.id;
	const models = def.models.map(m => (typeof m === 'string' ? {id: m, label: m} : {id: m.id, label: m.label ?? m.id}));
	if (models.some(m => typeof m.id !== 'string' || !m.id)) throw new Error(`Provider "${def.id}" has a model without an id.`);

	let stream: Provider['stream'];
	if (def.stream) {
		const custom = def.stream;
		stream = async function* (request) {
			yield* custom(request);
		};
	} else if (def.baseUrl) {
		stream = openAICompatibleStream({name, baseUrl: def.baseUrl.replace(/\/+$/, ''), headers: def.headers});
	} else {
		throw new Error(`Provider "${def.id}" needs a baseUrl (OpenAI-compatible) or a stream function.`);
	}

	return {id: def.id, name, apiKeyEnv: def.apiKeyEnv, baseUrl: def.baseUrl, models, stream};
}

export function normalizeCommand(def: PluginCommand): RegisteredCommand {
	if (!def || typeof def !== 'object') throw new Error('Command must be an object.');
	const bare = typeof def.name === 'string' ? def.name.replace(/^\//, '') : '';
	if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(bare)) {
		throw new Error(`Command name "${String(def.name)}" must be lowercase letters, digits or "-".`);
	}
	if (typeof def.description !== 'string' || !def.description) throw new Error(`Command /${bare} needs a description.`);
	if (typeof def.run !== 'function') throw new Error(`Command /${bare} needs a run(args, ctx) function.`);
	return {name: `/${bare}`, description: def.description, args: def.args, run: def.run};
}
