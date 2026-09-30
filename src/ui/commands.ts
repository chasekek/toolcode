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
	{keys: 'tab', description: 'Complete a command, or move to the panels'},
	{keys: 'shift+tab', description: 'Toggle plan mode'},
	{keys: 'esc', description: 'Interrupt response / back to the prompt'},
	{keys: 'pgup / pgdn', description: 'Scroll the conversation'},
	{keys: '0-4', description: 'Jump to a panel (from the panels)'},
	{keys: 'j / k', description: 'Move or scroll inside a panel'},
	{keys: 'g / G', description: 'Jump to the top / bottom'},
	{keys: 'ctrl+o', description: 'Expand or collapse tool output'},
	{keys: 'ctrl+l', description: 'Redraw the screen'},
	{keys: 'ctrl+u / ctrl+k', description: 'Delete to line start / end'},
	{keys: 'ctrl+w', description: 'Delete previous word'},
	{keys: 'ctrl+c', description: 'Clear input, press twice to exit'},
	{keys: 'shift+drag', description: 'Select text while the mouse is on'},
];
