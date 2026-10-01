import {ask} from './ask.js';
import {delegate} from './delegate.js';
import {delegateTasks} from './delegateTasks.js';
import {deleteFile} from './deleteFile.js';
import {editFile} from './editFile.js';
import {readFile} from './readFile.js';
import {search} from './search.js';
import type {Tool, TurnOptions} from './types.js';
import {todoWrite} from './todoWrite.js';
import {writeFile} from './writeFile.js';

/** Built-in tools first, then any registered by plugins. */
export const tools: Tool[] = [readFile, search, writeFile, editFile, deleteFile, todoWrite, ask, delegate, delegateTasks];

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

const NORMAL_TURN: TurnOptions = {orchestrator: false, parallel: true};

/** Tools offered for a turn; plan mode only gets read-only ones, and a tool can opt out per turn. */
export function toolsFor(readOnly: boolean, turn: TurnOptions = NORMAL_TURN): Tool[] {
	return tools.filter(t => (!readOnly || t.readOnly) && (t.available?.(turn) ?? true));
}
