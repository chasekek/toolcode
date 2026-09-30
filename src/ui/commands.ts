/** Slash commands live in core (plugins add to them); shortcuts are UI-only. */
export {allCommands, matchCommands, parseCommand, type SlashCommand} from '../core/commands.js';

export interface Shortcut {
	keys: string;
	description: string;
}

export const shortcuts: Shortcut[] = [
	{keys: 'enter', description: 'Send message'},
	{keys: '\\ + enter', description: 'New line (also alt+enter, ctrl+j)'},
	{keys: 'up / down', description: 'Browse input history'},
	{keys: 'tab', description: 'Complete a slash command'},
	{keys: 'shift+tab', description: 'Toggle plan mode'},
	{keys: 'esc', description: 'Interrupt response / close menu'},
	{keys: 'ctrl+o', description: 'Expand or collapse tool output'},
	{keys: 'ctrl+l', description: 'Clear the screen'},
	{keys: 'ctrl+u / ctrl+k', description: 'Delete to line start / end'},
	{keys: 'ctrl+w', description: 'Delete previous word'},
	{keys: 'ctrl+c', description: 'Clear input, press twice to exit'},
];
