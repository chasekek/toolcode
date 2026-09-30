/**
 * Screen geometry for the full-screen layout, kept pure so it can be reasoned
 * about (and tested) without rendering. Everything is in terminal cells.
 */

export type SidePanelId = 'session' | 'todos' | 'files' | 'tools';

/** Where keyboard input goes. The prompt is the default; the rest are panels. */
export type FocusId = 'prompt' | 'chat' | SidePanelId;

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SidePanel extends Rect {
	id: SidePanelId;
}

export interface LayoutInput {
	columns: number;
	rows: number;
	/** Lines in the prompt editor. */
	promptLines: number;
	/** Rows each side panel would like for its content (borders excluded). */
	wants: Record<Exclude<SidePanelId, 'session'>, number>;
	/** Open todos, shown in a strip above the prompt when there is no sidebar. */
	openTodos: number;
	focus: FocusId;
}

export interface Layout {
	/** Below the minimum size nothing but a notice is drawn. */
	tooSmall: boolean;
	width: number;
	height: number;
	/** Empty when the terminal is too narrow for a sidebar. */
	sidebar: SidePanel[];
	/** Session panel shows only its first lines when space is short. */
	compactSession: boolean;
	main: Rect;
	/** Narrow layouts only: open todos above the prompt. */
	todoStrip: Rect | null;
	prompt: Rect;
	keybar: Rect;
}

export const MIN_COLUMNS = 40;
export const MIN_ROWS = 12;
/** Narrower than this and the sidebar gives its space to the conversation. */
export const SIDEBAR_MIN_COLUMNS = 84;
export const MAX_PROMPT_LINES = 8;
/** Content lines of the full session panel; the compact one shows two. */
export const SESSION_LINES = 6;
const COMPACT_SESSION_LINES = 2;
const PANEL_MIN = 3; // border + one row
const MAX_STRIP_TODOS = 4;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Heights for the stacked side panels, filling `available` exactly. The
 * focused panel is served first; Tools absorbs what is left so the column
 * never ends short. Panels that can't get a single row are dropped, Files
 * first, but never the focused one.
 */
export function allocateSidebar(
	available: number,
	wants: LayoutInput['wants'],
	focus: FocusId,
): {heights: Partial<Record<SidePanelId, number>>; compactSession: boolean} {
	const full = SESSION_LINES + 2;
	const compact = COMPACT_SESSION_LINES + 2;
	let lists: Array<Exclude<SidePanelId, 'session'>> = ['todos', 'files', 'tools'];
	const compactSession = available < full + lists.length * PANEL_MIN;
	const session = Math.min(available, compactSession ? compact : full);
	let rest = available - session;

	const dropOrder: Array<Exclude<SidePanelId, 'session'>> = ['files', 'todos', 'tools'];
	for (const id of dropOrder) {
		if (rest >= lists.length * PANEL_MIN) break;
		if (id === focus && lists.length > 1) continue;
		lists = lists.filter(l => l !== id);
	}
	if (rest < lists.length * PANEL_MIN) lists = lists.filter(l => l === focus).slice(0, Math.floor(rest / PANEL_MIN));

	const heights: Partial<Record<SidePanelId, number>> = {session};
	for (const id of lists) heights[id] = PANEL_MIN;
	rest -= lists.length * PANEL_MIN;

	const order = [...lists.filter(id => id === focus), ...lists.filter(id => id !== focus)];
	for (const id of order) {
		const want = Math.max(PANEL_MIN, wants[id] + 2);
		const grant = Math.min(rest, want - heights[id]!);
		heights[id]! += grant;
		rest -= grant;
	}
	// Whatever is left goes to the bottom panel so the column is always full.
	const last = lists.at(-1);
	if (last) heights[last]! += rest;
	else heights.session = available;
	return {heights, compactSession};
}

export function computeLayout(input: LayoutInput): Layout {
	const width = input.columns;
	// Ink repaints the whole terminal when a frame is as tall as the screen, so keep one row free.
	const height = input.rows - 1;
	const tooSmall = input.columns < MIN_COLUMNS || input.rows < MIN_ROWS;

	const keybar: Rect = {x: 0, y: height - 1, width, height: 1};
	const promptInner = clamp(input.promptLines, 1, Math.min(MAX_PROMPT_LINES, Math.max(1, Math.floor(height / 4))));
	const prompt: Rect = {x: 0, y: keybar.y - promptInner - 2, width, height: promptInner + 2};

	const hasSidebar = width >= SIDEBAR_MIN_COLUMNS;
	const stripLines = hasSidebar || input.openTodos === 0 ? 0 : Math.min(input.openTodos, MAX_STRIP_TODOS);
	const todoStrip: Rect | null = stripLines > 0 ? {x: 0, y: prompt.y - stripLines - 2, width, height: stripLines + 2} : null;
	const bodyBottom = todoStrip ? todoStrip.y : prompt.y;

	if (!hasSidebar) {
		return {
			tooSmall,
			width,
			height,
			sidebar: [],
			compactSession: true,
			main: {x: 0, y: 0, width, height: Math.max(0, bodyBottom)},
			todoStrip,
			prompt,
			keybar,
		};
	}

	const sidebarWidth = clamp(Math.floor(width * 0.3), 30, 42);
	const bodyHeight = Math.max(0, bodyBottom);
	const {heights, compactSession} = allocateSidebar(bodyHeight, input.wants, input.focus);
	const sidebar: SidePanel[] = [];
	let y = 0;
	for (const id of ['session', 'todos', 'files', 'tools'] as const) {
		const h = heights[id];
		if (!h) continue;
		sidebar.push({id, x: 0, y, width: sidebarWidth, height: h});
		y += h;
	}

	return {
		tooSmall,
		width,
		height,
		sidebar,
		compactSession,
		main: {x: sidebarWidth, y: 0, width: width - sidebarWidth, height: bodyHeight},
		todoStrip: null,
		prompt,
		keybar,
	};
}

/** Whether a 0-based cell lies inside a rectangle. */
export function contains(rect: Rect, x: number, y: number): boolean {
	return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/**
 * First index of a `size`-row window over `count` items that keeps
 * `selected` visible, scrolling as little as possible from `previous`.
 */
export function windowStart(count: number, size: number, selected: number, previous = 0): number {
	if (count <= size) return 0;
	let start = clamp(previous, 0, count - size);
	if (selected < start) start = selected;
	if (selected >= start + size) start = selected - size + 1;
	return clamp(start, 0, count - size);
}
