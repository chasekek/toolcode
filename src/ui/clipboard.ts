/**
 * Copying through the terminal (OSC 52), which works over SSH too and needs no
 * clipboard tools. Windows Terminal, iTerm2, kitty, WezTerm, Alacritty, foot
 * and VS Code support it; elsewhere the sequence is ignored.
 */

/** The escape sequence that puts `text` on the system clipboard. */
export function clipboardSequence(text: string, env: NodeJS.ProcessEnv = process.env): string {
	const osc = `\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`;
	// tmux swallows OSC 52 unless it is wrapped for passthrough.
	return env['TMUX'] ? `\x1bPtmux;${osc.replace(/\x1b/g, '\x1b\x1b')}\x1b\\` : osc;
}
