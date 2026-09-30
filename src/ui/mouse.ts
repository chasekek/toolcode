/**
 * SGR mouse reporting (xterm 1006). Ink hands the report to useInput as text
 * with the leading escape stripped, e.g. "[<64;10;5M" for a wheel-up at
 * column 10, row 5, so every text field must ignore it.
 */

export const MOUSE_ON = '\x1b[?1000h\x1b[?1006h';
export const MOUSE_OFF = '\x1b[?1000l\x1b[?1006l';

export type MouseKind = 'press' | 'release' | 'wheelUp' | 'wheelDown';

export interface MouseEvent {
	kind: MouseKind;
	/** 0 left, 1 middle, 2 right; meaningless for the wheel. */
	button: number;
	/** 0-based cell. */
	x: number;
	y: number;
}

const PATTERN = /^\x1b?\[<(\d+);(\d+);(\d+)([Mm])$/;

export function isMouseInput(input: string): boolean {
	return PATTERN.test(input);
}

export function parseMouse(input: string): MouseEvent | null {
	const match = PATTERN.exec(input);
	if (!match) return null;
	const code = Number(match[1]);
	const x = Number(match[2]) - 1;
	const y = Number(match[3]) - 1;
	// Bits 2-4 carry modifiers and bit 5 motion; bit 6 marks the wheel.
	const base = code & ~(4 | 8 | 16 | 32);
	if (base >= 64) return {kind: base === 64 ? 'wheelUp' : 'wheelDown', button: 0, x, y};
	return {kind: match[4] === 'M' ? 'press' : 'release', button: base & 3, x, y};
}
