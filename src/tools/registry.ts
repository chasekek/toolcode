import {ask} from './ask.js';
import {deleteFile} from './deleteFile.js';
import {readFile} from './readFile.js';
import type {Tool} from './types.js';
import {todoWrite} from './todoWrite.js';
import {writeFile} from './writeFile.js';

/** Built-in tools first, then any registered by plugins. */
export const tools: Tool[] = [readFile, writeFile, deleteFile, todoWrite, ask];

export function registerTool(tool: Tool): void {
	if (getTool(tool.name)) throw new Error(`A tool named "${tool.name}" already exists.`);
	tools.push(tool);
}

export function unregisterTool(name: string): void {
	const index = tools.findIndex(t => t.name === name);
	if (index !== -1) tools.splice(index, 1);
}

export function getTool(name: string): Tool | undefined {
	return tools.find(t => t.name === name);
}

/** Tools offered for a turn; plan mode only gets read-only ones. */
export function toolsFor(readOnly: boolean): Tool[] {
	return readOnly ? tools.filter(t => t.readOnly) : tools;
}
