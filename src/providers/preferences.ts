import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The provider and model the user picked last. */
export interface ModelChoice {
	providerId: string;
	model: string;
}

/** Where the last-used model is remembered. Read on each call so tests can point it elsewhere. */
export function preferencesFile(): string {
	return process.env['TOOLCODE_PREFS_FILE'] || path.join(os.homedir(), '.toolcode', 'preferences.json');
}

/** The remembered model, or undefined when nothing was saved or the file is unreadable. */
export function loadModelChoice(): ModelChoice | undefined {
	const file = preferencesFile();
	if (!existsSync(file)) return undefined;
	try {
		const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
		const {providerId, model} = (parsed ?? {}) as Partial<ModelChoice>;
		if (typeof providerId === 'string' && typeof model === 'string' && providerId && model) return {providerId, model};
	} catch {
		// A corrupt file behaves like an empty one; the next pick rewrites it.
	}
	return undefined;
}

/** Best effort: failing to remember a choice must never break picking it. */
export function saveModelChoice(choice: ModelChoice): void {
	try {
		const file = preferencesFile();
		mkdirSync(path.dirname(file), {recursive: true});
		writeFileSync(file, JSON.stringify(choice, null, '\t') + '\n');
	} catch {
		// Read-only home or similar; the choice just won't outlive this session.
	}
}
