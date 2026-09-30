/** Small string helpers for fitting text into fixed-width cells. */

/** Shortens text to fit `max` columns by cutting out the middle. */
export function truncateMiddle(text: string, max: number, ellipsis = '…'): string {
	if (text.length <= max) return text;
	if (max <= ellipsis.length) return ellipsis.slice(0, Math.max(0, max));
	const room = max - ellipsis.length;
	const head = Math.ceil(room / 2);
	const tail = Math.floor(room / 2);
	return `${text.slice(0, head)}${ellipsis}${text.slice(text.length - tail)}`;
}

/** Replaces the home directory prefix with "~". */
export function tildePath(dir: string, home: string): string {
	if (!home) return dir;
	const normalized = dir.replace(/\\/g, '/');
	const base = home.replace(/\\/g, '/').replace(/\/+$/, '');
	if (normalized === base) return '~';
	if (normalized.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return `~${normalized.slice(base.length)}`;
	return dir;
}

/** "1.2s", "340ms", "2m 5s". */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

/**
 * Tabs become spaces before text reaches the screen: a terminal draws a tab
 * as a jump to the next stop, which Ink can't measure, so it would break the
 * panel borders.
 */
export function expandTabs(text: string): string {
	return text.includes('\t') ? text.replace(/\t/g, '  ') : text;
}

/** "3 files", "1 file". */
export function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
