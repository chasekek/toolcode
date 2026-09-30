import type {ModelInfo, Provider} from '../providers/types.js';

/** One selectable model together with the provider that serves it. */
export interface ModelEntry {
	provider: Provider;
	model: ModelInfo;
}

export type ModelSort = 'provider' | 'name' | 'free';

export interface ModelFilter {
	/** Whitespace-separated terms; every term must match somewhere. */
	query: string;
	sort: ModelSort;
	/** Only models the provider marks as free to use. */
	freeOnly: boolean;
}

export const MODEL_SORTS: ModelSort[] = ['provider', 'name', 'free'];

/** Short label for the sort, shown in the picker's status line. */
export function sortLabel(sort: ModelSort): string {
	return sort === 'provider' ? 'provider' : sort === 'name' ? 'name' : 'free first';
}

/**
 * The models the picker should offer, in the order it should offer them.
 * Kept pure so the ordering rules can be tested without a terminal.
 */
export function selectModels(providers: Provider[], filter: ModelFilter): ModelEntry[] {
	const terms = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
	const entries: ModelEntry[] = [];
	for (const provider of providers) {
		for (const model of provider.models) {
			if (filter.freeOnly && !isFree(model)) continue;
			// Every term has to appear somewhere, so "sonnet openrouter" narrows rather than widens.
			const haystack = `${model.label} ${model.id} ${provider.name}`.toLowerCase();
			if (!terms.every(term => haystack.includes(term))) continue;
			entries.push({provider, model});
		}
	}
	return sortEntries(entries, filter.sort);
}

/** A model is free when the catalog says so, or when its id carries the `:free` suffix. */
export function isFree(model: ModelInfo): boolean {
	return model.free === true || model.id.endsWith(':free');
}

/** Providers first keeps the grouped headings meaningful; the rest sort within that. */
function sortEntries(entries: ModelEntry[], sort: ModelSort): ModelEntry[] {
	const byName = (a: ModelEntry, b: ModelEntry) => a.model.label.localeCompare(b.model.label);
	const byProvider = (a: ModelEntry, b: ModelEntry) =>
		a.provider.name.localeCompare(b.provider.name) || byName(a, b);
	if (sort === 'name') return [...entries].sort(byName);
	if (sort === 'free') {
		return [...entries].sort((a, b) => Number(isFree(b.model)) - Number(isFree(a.model)) || byProvider(a, b));
	}
	return [...entries].sort(byProvider);
}
