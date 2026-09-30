import {useCallback, useReducer, useRef} from 'react';

/**
 * State whose latest value can be read immediately after it is set.
 *
 * Ink delivers keys outside React's event system, and React 19 defers the
 * resulting renders, so two keys read in the same tick would both see the
 * value from before the first one. Handlers that build on the current value
 * (a text editor, above all) read it through `read()` instead.
 */
export function useSyncState<T>(initial: T): [value: T, set: (next: T | ((previous: T) => T)) => void, read: () => T] {
	const ref = useRef(initial);
	const [, rerender] = useReducer((n: number) => n + 1, 0);
	const set = useCallback((next: T | ((previous: T) => T)) => {
		ref.current = typeof next === 'function' ? (next as (previous: T) => T)(ref.current) : next;
		rerender();
	}, []);
	const read = useCallback(() => ref.current, []);
	return [ref.current, set, read];
}
