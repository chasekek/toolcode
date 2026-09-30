import assert from 'node:assert/strict';
import test from 'node:test';
import {openrouter, orderModels, refreshOpenRouterModels} from '../dist/providers/openrouter.js';

const realFetch = globalThis.fetch;

/** Answers the catalog request with a fixed payload, then restores fetch. */
async function withCatalog(payload, run) {
	const before = openrouter.models;
	globalThis.fetch = async () => ({
		ok: true,
		status: 200,
		headers: new Headers(),
		json: async () => payload,
	});
	try {
		return await run();
	} finally {
		globalThis.fetch = realFetch;
		openrouter.models = before;
	}
}

test('every model in the catalog is offered, curated ones first', async () => {
	await withCatalog(
		{
			data: [
				{id: 'x-ai/grok-4', name: 'Grok 4'},
				{id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5'},
				{id: 'mistralai/mistral-large', name: 'Mistral Large'},
			],
		},
		async () => {
			const count = await refreshOpenRouterModels();
			assert.equal(count, 8);
			assert.deepEqual(
				openrouter.models.slice(0, 6).map(m => m.label),
				['Claude Sonnet 4.5', 'Claude Opus 4.1', 'GPT-5', 'Gemini 2.5 Pro', 'DeepSeek V3.1', 'Qwen3 Coder'],
			);
			assert.deepEqual(
				openrouter.models.slice(6).map(m => m.id),
				['x-ai/grok-4', 'mistralai/mistral-large'],
			);
		},
	);
});

test('a model without a usable id is skipped, one without a name falls back to its id', async () => {
	await withCatalog({data: [{id: 'a/b'}, {id: ''}, {name: 'no id'}, null]}, async () => {
		await refreshOpenRouterModels();
		const scraped = openrouter.models.filter(m => m.id === 'a/b');
		assert.equal(scraped.length, 1);
		assert.equal(scraped[0].label, 'a/b');
	});
});

test('a response that is not the catalog leaves the current list alone', async () => {
	const before = openrouter.models;
	globalThis.fetch = async () => ({ok: true, status: 200, headers: new Headers(), json: async () => ({error: 'nope'})});
	try {
		await assert.rejects(refreshOpenRouterModels(), /data/);
		assert.equal(openrouter.models, before);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('a model listed twice is offered once, keeping the curated label', () => {
	const ordered = orderModels([
		{id: 'anthropic/claude-sonnet-4.5', label: 'From the catalog'},
		{id: 'anthropic/claude-sonnet-4.5', label: 'Also from the catalog'},
		{id: 'dup/model', label: 'Only from the catalog'},
	]);
	assert.equal(ordered.filter(m => m.id === 'anthropic/claude-sonnet-4.5').length, 1);
	assert.equal(ordered.find(m => m.id === 'anthropic/claude-sonnet-4.5').label, 'Claude Sonnet 4.5');
	assert.equal(ordered.filter(m => m.id === 'dup/model').length, 1);
});
