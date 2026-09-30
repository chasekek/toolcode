import {format} from 'node:util';
import type {NoticeLevel} from '../core/types.js';

type Listener = (level: NoticeLevel, text: string) => void;

const listeners = new Set<Listener>();
// Output from before the app subscribes, e.g. plugins logging while they load.
const pending: Array<[NoticeLevel, string]> = [];

/**
 * Redirects console output into the app. Anything printed straight to the
 * terminal would land on top of the full-screen frame, so plugin logs are
 * shown as notices in the conversation instead. Returns a function that
 * puts the console back.
 */
export function captureConsole(): () => void {
	const original = {log: console.log, info: console.info, debug: console.debug, warn: console.warn, error: console.error};
	const forward =
		(level: NoticeLevel) =>
		(...args: unknown[]) => {
			const text = format(...args);
			if (listeners.size === 0) pending.push([level, text]);
			for (const listener of listeners) listener(level, text);
		};
	console.log = console.info = console.debug = forward('info');
	console.warn = forward('warning');
	console.error = forward('error');
	return () => Object.assign(console, original);
}

/** Receives captured console output, starting with anything logged before subscribing. */
export function onConsole(listener: Listener): () => void {
	for (const [level, text] of pending.splice(0)) listener(level, text);
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
