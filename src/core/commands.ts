export interface SlashCommand {
	/** Includes the slash, e.g. "/help". */
	name: string;
	description: string;
	/** Argument hint shown in the menu, e.g. "[task]". */
	args?: string;
}

export interface CommandContext {
	cwd: string;
}

/** A slash command added by a plugin. Whatever `run` returns is shown as the reply. */
export interface RegisteredCommand extends SlashCommand {
	run: (args: string, ctx: CommandContext) => unknown;
}

export const builtinCommands: SlashCommand[] = [
	{name: '/help', description: 'Show commands and shortcuts'},
	{name: '/model', description: 'Switch the model'},
	{name: '/auth', description: 'Set API keys for your providers', args: '[provider]'},
	{name: '/plan', description: 'Toggle plan mode, or plan a task', args: '[task]'},
	{name: '/orchestrate', description: 'Toggle orchestrator mode, or orchestrate a task', args: '[task]'},
	{name: '/agents', description: 'Show delegated agents (Claude Code)'},
	{name: '/improve', description: 'Suggest improvements', args: '[focus]'},
	{name: '/judge', description: 'Evaluate the last response'},
	{name: '/retry', description: 'Retry the last request'},
	{name: '/clear', description: 'Clear the conversation'},
	{name: '/marketplace', description: 'Browse and install plugins'},
	{name: '/plugins', description: 'List loaded plugins'},
	{name: '/config', description: 'Open settings'},
	{name: '/exit', description: 'Quit TOOLCODE'},
];

// Handled by the app but kept out of the menu.
const hiddenBuiltins = ['/quit'];

const pluginCommands: RegisteredCommand[] = [];

export function getCommand(name: string): RegisteredCommand | undefined {
	return pluginCommands.find(c => c.name === name);
}

export function registerCommand(command: RegisteredCommand): void {
	if (isCommandTaken(command.name)) throw new Error(`Command ${command.name} already exists.`);
	pluginCommands.push(command);
}

export function unregisterCommand(name: string): void {
	const index = pluginCommands.findIndex(c => c.name === name);
	if (index !== -1) pluginCommands.splice(index, 1);
}

export function isCommandTaken(name: string): boolean {
	return hiddenBuiltins.includes(name) || allCommands().some(c => c.name === name);
}

export function allCommands(): SlashCommand[] {
	return [...builtinCommands, ...pluginCommands];
}

/** Commands matching what the user typed so far; empty once arguments start. */
export function matchCommands(input: string): SlashCommand[] {
	if (!input.startsWith('/') || /\s/.test(input)) return [];
	const query = input.toLowerCase();
	return allCommands().filter(c => c.name.startsWith(query));
}

export function parseCommand(input: string): {name: string; args: string} {
	const trimmed = input.trim();
	const space = trimmed.search(/\s/);
	if (space === -1) return {name: trimmed.toLowerCase(), args: ''};
	return {name: trimmed.slice(0, space).toLowerCase(), args: trimmed.slice(space).trim()};
}
