export class AbortError extends Error {
	constructor() {
		super('Aborted');
		this.name = 'AbortError';
	}
}

/** True for our AbortError and for the DOMException fetch throws when aborted. */
export function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}
