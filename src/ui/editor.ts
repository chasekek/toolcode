/**
 * Pure text-editing operations for the multiline prompt. The cursor is an
 * offset into `value`; lines are separated by "\n".
 */
export interface EditorState {
	value: string;
	cursor: number;
}

export const emptyEditor: EditorState = {value: '', cursor: 0};

export function fromText(value: string): EditorState {
	return {value, cursor: value.length};
}

export function position(state: EditorState): {line: number; col: number} {
	const before = state.value.slice(0, state.cursor);
	const lines = before.split('\n');
	return {line: lines.length - 1, col: lines.at(-1)!.length};
}

function offsetOf(lines: string[], line: number, col: number): number {
	let offset = 0;
	for (let i = 0; i < line; i++) offset += lines[i]!.length + 1;
	return offset + Math.min(col, lines[line]!.length);
}

export function insert(state: EditorState, text: string): EditorState {
	const {value, cursor} = state;
	return {value: value.slice(0, cursor) + text + value.slice(cursor), cursor: cursor + text.length};
}

export function backspace(state: EditorState): EditorState {
	if (state.cursor === 0) return state;
	const {value, cursor} = state;
	return {value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1};
}

export function deleteForward(state: EditorState): EditorState {
	const {value, cursor} = state;
	if (cursor >= value.length) return state;
	return {value: value.slice(0, cursor) + value.slice(cursor + 1), cursor};
}

export function moveLeft(state: EditorState): EditorState {
	return {...state, cursor: Math.max(0, state.cursor - 1)};
}

export function moveRight(state: EditorState): EditorState {
	return {...state, cursor: Math.min(state.value.length, state.cursor + 1)};
}

export function lineStart(state: EditorState): EditorState {
	const {line} = position(state);
	return {...state, cursor: offsetOf(state.value.split('\n'), line, 0)};
}

export function lineEnd(state: EditorState): EditorState {
	const lines = state.value.split('\n');
	const {line} = position(state);
	return {...state, cursor: offsetOf(lines, line, lines[line]!.length)};
}

/** Moves the cursor one line up or down; returns null when already on the edge line. */
export function moveVertical(state: EditorState, direction: -1 | 1): EditorState | null {
	const lines = state.value.split('\n');
	const {line, col} = position(state);
	const target = line + direction;
	if (target < 0 || target >= lines.length) return null;
	return {...state, cursor: offsetOf(lines, target, col)};
}

export function killToStart(state: EditorState): EditorState {
	const start = lineStart(state).cursor;
	return {value: state.value.slice(0, start) + state.value.slice(state.cursor), cursor: start};
}

export function killToEnd(state: EditorState): EditorState {
	const end = lineEnd(state).cursor;
	return {value: state.value.slice(0, state.cursor) + state.value.slice(end), cursor: state.cursor};
}

export function deleteWordBefore(state: EditorState): EditorState {
	const before = state.value.slice(0, state.cursor);
	const start = before.replace(/\S+\s*$|\s+$/, '').length;
	return {value: state.value.slice(0, start) + state.value.slice(state.cursor), cursor: start};
}

/** Normalizes pasted text: unify line endings, drop control characters except newline and tab. */
export function sanitizePaste(text: string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.replace(/\x1b\[20[01]~/g, '') // bracketed paste markers
		.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
		.replace(/\t/g, '  ');
}
