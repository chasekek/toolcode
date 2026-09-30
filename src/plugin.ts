/**
 * Optional helpers for plugin authors: `import {definePlugin} from '@chasekek/toolcode/plugin'`
 * gives editor autocomplete. Plugins work without importing anything.
 */
import type {PluginDefinition, PluginProvider, PluginTool} from './plugins/types.js';

export type * from './plugins/types.js';

export function definePlugin(plugin: PluginDefinition): PluginDefinition {
	return plugin;
}

export function defineTool(tool: PluginTool): PluginTool {
	return tool;
}

export function defineProvider(provider: PluginProvider): PluginProvider {
	return provider;
}
