import {getStoredKey} from './auth.js';
import {openrouter} from './openrouter.js';
import type {Provider} from './types.js';

/** Built-in providers first, then any registered by plugins. */
export const providers: Provider[] = [openrouter];

export function registerProvider(provider: Provider): void {
	if (getProvider(provider.id)) throw new Error(`A provider with id "${provider.id}" already exists.`);
	providers.push(provider);
}

export function unregisterProvider(id: string): void {
	const index = providers.findIndex(p => p.id === id);
	if (index !== -1) providers.splice(index, 1);
}

export function getProvider(id: string): Provider | undefined {
	return providers.find(p => p.id === id);
}

export type KeySource = 'env' | 'saved' | 'none' | 'not-needed';

/** Where a provider's key comes from. The environment variable wins over a key saved with /auth. */
export function keySource(provider: Provider): KeySource {
	if (!provider.apiKeyEnv) return 'not-needed';
	if (process.env[provider.apiKeyEnv]?.trim()) return 'env';
	return getStoredKey(provider.id) ? 'saved' : 'none';
}

/**
 * The key to send, or undefined when the provider needs one that isn't set.
 * Providers without `apiKeyEnv` get an empty string: ready to use.
 */
export function getApiKey(provider: Provider): string | undefined {
	if (!provider.apiKeyEnv) return '';
	return process.env[provider.apiKeyEnv]?.trim() || getStoredKey(provider.id);
}

export function hasApiKey(provider: Provider): boolean {
	return getApiKey(provider) !== undefined;
}

/** Startup provider: the first one that's ready to use, else the first built-in. */
export function defaultProvider(): Provider {
	return providers.find(hasApiKey) ?? providers[0]!;
}

/** Finds a model by "provider:model", exact id, or label, across all providers. */
export function findModel(query: string): {provider: Provider; modelId: string; label: string} | undefined {
	const q = query.trim().toLowerCase();
	if (!q) return undefined;
	for (const provider of providers) {
		for (const m of provider.models) {
			if ([`${provider.id}:${m.id}`, m.id, m.label].some(s => s.toLowerCase() === q)) {
				return {provider, modelId: m.id, label: m.label};
			}
		}
	}
	return undefined;
}
