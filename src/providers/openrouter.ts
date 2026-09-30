import {openAICompatibleStream} from './openaiCompatible.js';
import type {ModelInfo, Provider} from './types.js';

const baseUrl = 'https://openrouter.ai/api/v1';

const SCRAPE_TIMEOUT_MS = 8000;

/**
 * What the picker shows before the catalog lands, and for good when the scrape
 * fails: a short list beats an empty one, and losing the picker over a network
 * blip is never the right trade.
 */
const CURATED: ModelInfo[] = [
	{id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5'},
	{id: 'anthropic/claude-opus-4.1', label: 'Claude Opus 4.1'},
	{id: 'openai/gpt-5', label: 'GPT-5'},
	{id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro'},
	{id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek V3.1'},
	{id: 'qwen/qwen3-coder', label: 'Qwen3 Coder'},
];

export const openrouter: Provider = {
	id: 'openrouter',
	name: 'OpenRouter',
	apiKeyEnv: 'OPENROUTER_API_KEY',
	baseUrl,
	models: CURATED,
	stream: openAICompatibleStream({
		name: 'OpenRouter',
		baseUrl,
		headers: {'X-Title': 'TOOLCODE'},
	}),
};

/** Curated first, then everything else in catalog order, each model listed once. */
export function orderModels(scraped: ModelInfo[]): ModelInfo[] {
	const seen = new Set<string>();
	const out: ModelInfo[] = [];
	for (const model of [...CURATED, ...scraped]) {
		if (seen.has(model.id)) continue;
		seen.add(model.id);
		out.push(model);
	}
	return out;
}

/** The catalog is public, so no key is sent and it works before you have one. */
async function fetchCatalog(signal?: AbortSignal): Promise<ModelInfo[]> {
	const timeout = AbortSignal.timeout(SCRAPE_TIMEOUT_MS);
	const response = await fetch(`${baseUrl}/models`, {
		headers: {'X-Title': 'TOOLCODE'},
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const body = (await response.json()) as {data?: unknown};
	if (!Array.isArray(body.data)) throw new Error('the response has no "data" array');
	return body.data.flatMap(entry => {
		const model = (entry ?? {}) as {id?: unknown; name?: unknown; pricing?: {prompt?: unknown}};
		if (typeof model.id !== 'string' || !model.id) return [];
		return [{
			id: model.id,
			label: typeof model.name === 'string' && model.name ? model.name : model.id,
			// OpenRouter publishes a price per million tokens; a zero prompt price means free.
			// The `:free` id suffix is a second signal, since the price can be missing.
			free: isFreePrice(model.pricing?.prompt) || model.id.endsWith(':free'),
		}];
	});
}

/** Treats "0", 0 and "0.000000" as free, and anything unparseable as not free. */
function isFreePrice(prompt: unknown): boolean {
	if (typeof prompt === 'number') return prompt === 0;
	if (typeof prompt !== 'string') return false;
	const price = Number.parseFloat(prompt);
	return Number.isFinite(price) && price === 0;
}

/**
 * Replaces the model list with the whole OpenRouter catalog. The provider
 * object is shared, so the picker sees the new list the next time it renders.
 *
 * Callers own the failure: this rejects rather than swallowing, because a
 * caller may want to say why, while the curated list stays in place either way.
 */
export async function refreshOpenRouterModels(signal?: AbortSignal): Promise<number> {
	const models = orderModels(await fetchCatalog(signal));
	openrouter.models = models;
	return models.length;
}
