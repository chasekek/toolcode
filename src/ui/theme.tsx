import {createContext, useContext, type ReactNode} from 'react';

/**
 * Semantic color tokens. Components never use raw color names; they ask the
 * theme for a role so the palette can change in one place.
 *
 * Only accents are set: body text keeps the terminal's own foreground, so the
 * palette reads on dark and light backgrounds alike. Hex values degrade to the
 * nearest ANSI color on terminals without truecolor.
 */
export interface Colors {
	/** Commands, key hints, links, inline code. */
	primary: string;
	/** Brand, plan mode, activity. */
	accent: string;
	success: string;
	warning: string;
	error: string;
	/** Informational text that should still stand out from muted. */
	info: string;
	muted: string;
	/** Border of panels that don't have focus. */
	border: string;
	/** Border and title of the focused panel. */
	borderActive: string;
	/** Background of the selected row in a list; always paired with `selectionText`. */
	selection: string;
	selectionText: string;
	/** Stops of the brand gradient used by the logo. */
	gradient: string[];
}

/** Characters for the panel frames drawn by hand (titles live inside the border). */
export interface BoxChars {
	topLeft: string;
	topRight: string;
	bottomLeft: string;
	bottomRight: string;
	horizontal: string;
	vertical: string;
}

export interface Symbols {
	prompt: string;
	pointer: string;
	bullet: string;
	check: string;
	cross: string;
	info: string;
	warning: string;
	elbow: string;
	ellipsis: string;
	dot: string;
	listBullet: string;
	bar: string;
	arrowUpDown: string;
	arrowDown: string;
	/** Masks each character of a typed secret. */
	secret: string;
	brand: string;
	marketplace: string;
	iconTool: string;
	iconProvider: string;
	iconCommand: string;
	rowMark: string;
	keyTab: string;
	keyEnter: string;
	todoDone: string;
	todoDoing: string;
	todoReady: string;
	todoBlocked: string;
	/** Filled and empty cells of a progress bar. */
	progressFull: string;
	progressEmpty: string;
	/** Thumb drawn over a panel's right border when its content scrolls. */
	scrollThumb: string;
	toggleOn: string;
	toggleOff: string;
	spinner: string[];
	box: BoxChars;
}

export interface Theme {
	colors: Colors;
	symbols: Symbols;
	unicode: boolean;
	/** Ink border style: rounded corners need Unicode, "classic" is plain ASCII. */
	borderStyle: 'round' | 'classic';
}

// A night palette with mid-tone accents, so it holds up on light backgrounds too.
const colors: Colors = {
	primary: '#7aa2f7',
	accent: '#bb9af7',
	success: '#9ece6a',
	warning: '#e0af68',
	error: '#f7768e',
	info: '#7dcfff',
	muted: '#737aa2',
	border: '#414868',
	borderActive: '#9ece6a',
	selection: '#2e3c64',
	selectionText: '#c0caf5',
	gradient: ['#7aa2f7', '#bb9af7', '#f7768e'],
};

const unicodeSymbols: Symbols = {
	prompt: '❯',
	pointer: '❯',
	bullet: '●',
	check: '✓',
	cross: '✕',
	info: 'ℹ',
	warning: '⚠',
	elbow: '⎿',
	ellipsis: '…',
	dot: '·',
	listBullet: '•',
	bar: '│',
	arrowUpDown: '↑↓',
	arrowDown: '↓',
	secret: '•',
	brand: '◆',
	marketplace: '◈',
	iconTool: '⚒',
	iconProvider: '⚡',
	iconCommand: '▸',
	rowMark: '▌',
	keyTab: '⇥',
	keyEnter: '⏎',
	todoDone: '✓',
	todoDoing: '▶',
	todoReady: '○',
	todoBlocked: '◌',
	progressFull: '━',
	progressEmpty: '─',
	scrollThumb: '┃',
	toggleOn: '◉',
	toggleOff: '○',
	spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
	box: {topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯', horizontal: '─', vertical: '│'},
};

const asciiSymbols: Symbols = {
	prompt: '>',
	pointer: '>',
	bullet: '*',
	check: 'v',
	cross: 'x',
	info: 'i',
	warning: '!',
	elbow: 'L',
	ellipsis: '...',
	dot: '-',
	listBullet: '-',
	bar: '|',
	arrowUpDown: 'up/down',
	arrowDown: 'v',
	secret: '*',
	brand: '*',
	marketplace: '*',
	iconTool: '#',
	iconProvider: '~',
	iconCommand: '>',
	rowMark: '>',
	keyTab: 'tab',
	keyEnter: 'enter',
	todoDone: '[x]',
	todoDoing: '[>]',
	todoReady: '[ ]',
	todoBlocked: '[-]',
	progressFull: '=',
	progressEmpty: '-',
	scrollThumb: '#',
	toggleOn: '[x]',
	toggleOff: '[ ]',
	spinner: ['|', '/', '-', '\\'],
	box: {topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', horizontal: '-', vertical: '|'},
};

/** Best guess at whether the terminal can draw Unicode symbols. */
export function detectUnicode(): boolean {
	if (process.env['TERM'] === 'linux') return false;
	if (process.platform !== 'win32') return true;
	// Legacy conhost mangles many symbols; modern Windows terminals set one of these.
	return Boolean(
		process.env['WT_SESSION'] ||
			process.env['TERM_PROGRAM'] ||
			process.env['ConEmuTask'] ||
			process.env['TERMINAL_EMULATOR'],
	);
}

export function createTheme(unicode: boolean): Theme {
	return {
		colors,
		symbols: unicode ? unicodeSymbols : asciiSymbols,
		unicode,
		borderStyle: unicode ? 'round' : 'classic',
	};
}

function parseHex(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `count` colors spread evenly along the gradient through `stops` (hex colors). */
export function gradientColors(stops: string[], count: number): string[] {
	if (count <= 0) return [];
	if (stops.length === 1 || count === 1) return Array.from({length: count}, () => stops[0]!);
	const rgb = stops.map(parseHex);
	return Array.from({length: count}, (_, i) => {
		const t = (i / (count - 1)) * (rgb.length - 1);
		const segment = Math.min(Math.floor(t), rgb.length - 2);
		const local = t - segment;
		const [a, b] = [rgb[segment]!, rgb[segment + 1]!];
		const mix = a.map((v, k) => Math.round(v + (b[k]! - v) * local));
		return `#${mix.map(v => v.toString(16).padStart(2, '0')).join('')}`;
	});
}

const ThemeContext = createContext<Theme>(createTheme(true));

export function ThemeProvider({theme, children}: {theme: Theme; children: ReactNode}) {
	return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
	return useContext(ThemeContext);
}
