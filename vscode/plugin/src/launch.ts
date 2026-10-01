import * as path from 'node:path';

/** The extension settings that shape the TOOLCODE command line. */
export interface LaunchSettings {
	/** A command on PATH, or a path to TOOLCODE's dist/cli.js. */
	path: string;
	ascii: boolean;
	mouse: boolean;
	orchestrator: boolean;
	plugins: string[];
	loadUserPlugins: boolean;
}

/** What the terminal runs: an executable and its arguments. */
export interface Launch {
	shellPath: string;
	shellArgs: string[];
}

/**
 * TOOLCODE's own flags for these settings. Relative plugin paths resolve
 * against `cwd`, since that is where the user wrote them from.
 */
export function toolcodeArgs(settings: LaunchSettings, cwd: string): string[] {
	const args: string[] = [];
	if (settings.ascii) args.push('--ascii');
	if (!settings.mouse) args.push('--no-mouse');
	if (settings.orchestrator) args.push('--orchestrator');
	if (!settings.loadUserPlugins) args.push('--no-plugins');
	for (const plugin of settings.plugins) {
		if (plugin.trim()) args.push('--plugin', path.resolve(cwd, plugin.trim()));
	}
	return args;
}

/**
 * The process the terminal starts. A .js path runs under node. On Windows a
 * bare command is usually an npm `.cmd` shim, which only a shell can start,
 * so it goes through cmd.exe.
 */
export function launchFor(settings: LaunchSettings, cwd: string, platform: NodeJS.Platform = process.platform): Launch {
	const command = settings.path.trim() || 'toolcode';
	const args = toolcodeArgs(settings, cwd);
	if (/\.[cm]?js$/i.test(command)) return {shellPath: 'node', shellArgs: [path.resolve(cwd, command), ...args]};
	if (platform === 'win32') return {shellPath: 'cmd.exe', shellArgs: ['/d', '/c', command, ...args]};
	return {shellPath: command, shellArgs: args};
}

/**
 * A one-line reference to a file or a line range for the TOOLCODE prompt,
 * e.g. `src/app.ts:12-20 `. It stays on one line because Enter in the prompt
 * submits. Lines are 1-based; `start` alone names a single line.
 */
export function fileReference(relativePath: string, start?: number, end?: number): string {
	let ref = relativePath.split(path.sep).join('/');
	if (/\s/.test(ref)) ref = `"${ref}"`;
	if (start !== undefined) ref += end !== undefined && end !== start ? `:${start}-${end}` : `:${start}`;
	return `${ref} `;
}
