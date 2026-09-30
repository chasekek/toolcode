import {createContext, useContext, type ReactNode} from 'react';

/**
 * Semantic color tokens. Components never use raw color names; they ask the
 * theme for a role so the palette can change in one place.
 */
export interface Colors {
	primary: string;
	accent: string;
	success: string;
	warning: string;
	error: string;
	muted: string;
	border: string;
	borderActive: string;
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
	todoDone: string;
	todoDoing: string;
	todoReady: string;
	todoBlocked: string;
	spinner: string[];
}

export interface Theme {
	colors: Colors;
	symbols: Symbols;
	unicode: boolean;
	/** Ink border style: rounded corners need Unicode, "classic" is plain ASCII. */
	borderStyle: 'round' | 'classic';
}

const colors: Colors = {
	primary: 'cyan',
	accent: 'magenta',
	success: 'green',
	warning: 'yellow',
	error: 'red',
	muted: 'gray',
	border: 'gray',
	borderActive: 'cyan',
};

const unicodeSymbols: Symbols = {
	prompt: '>',
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
	todoDone: '✓',
	todoDoing: '▶',
	todoReady: '○',
	todoBlocked: '◌',
	spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
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
	todoDone: '[x]',
	todoDoing: '[>]',
	todoReady: '[ ]',
	todoBlocked: '[-]',
	spinner: ['|', '/', '-', '\\'],
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

const ThemeContext = createContext<Theme>(createTheme(true));

export function ThemeProvider({theme, children}: {theme: Theme; children: ReactNode}) {
	return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
	return useContext(ThemeContext);
}
