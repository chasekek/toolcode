import {useRef} from 'react';
import {useInput, type Key} from 'ink';

type Handler = (input: string, key: Key) => void;

/**
 * useInput that always runs the handler from the latest render. Ink swaps
 * handlers in a passive effect, so a key arriving before effects flush (fast
 * typing, key repeat, a slow frame) would otherwise see stale state and
 * silently undo the previous keystroke.
 */
export function useKeys(handler: Handler, options?: {isActive?: boolean}): void {
	const latest = useRef(handler);
	latest.current = handler;
	useInput((input, key) => latest.current(input, key), options);
}
