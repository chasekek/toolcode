import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {getStoredKey, removeStoredKey, setStoredKey} from '../dist/providers/auth.js';
import {getApiKey, keySource} from '../dist/providers/registry.js';
import {tempDir} from './helpers.mjs';

const provider = {id: 'acme', name: 'Acme', apiKeyEnv: 'ACME_TEST_API_KEY', models: [{id: 'm', label: 'm'}]};

/** Points the key store at a fresh file for the duration of `fn`. */
async function withAuthFile(fn) {
	const {dir, cleanup} = tempDir();
	const file = path.join(dir, 'nested', 'auth.json');
	const previous = process.env.TOOLCODE_AUTH_FILE;
	process.env.TOOLCODE_AUTH_FILE = file;
	try {
		await fn(file);
	} finally {
		if (previous === undefined) delete process.env.TOOLCODE_AUTH_FILE;
		else process.env.TOOLCODE_AUTH_FILE = previous;
		delete process.env.ACME_TEST_API_KEY;
		cleanup();
	}
}

test('saved keys round trip through the file and back out', () =>
	withAuthFile(file => {
		assert.equal(keySource(provider), 'none');
		assert.equal(getApiKey(provider), undefined);
		setStoredKey('acme', '  sk-saved  ');
		assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {acme: 'sk-saved'});
		if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
		assert.equal(keySource(provider), 'saved');
		assert.equal(getApiKey(provider), 'sk-saved');
		assert.equal(removeStoredKey('acme'), true);
		assert.equal(removeStoredKey('acme'), false);
		assert.equal(getApiKey(provider), undefined);
		assert.throws(() => setStoredKey('acme', '   '), /empty/);
	}));

test('the environment variable wins over a saved key', () =>
	withAuthFile(() => {
		setStoredKey('acme', 'sk-saved');
		process.env.ACME_TEST_API_KEY = 'sk-env';
		assert.equal(keySource(provider), 'env');
		assert.equal(getApiKey(provider), 'sk-env');
		assert.equal(keySource({...provider, apiKeyEnv: undefined}), 'not-needed');
	}));

test('a corrupt auth file reads as empty and is rewritten on save', () =>
	withAuthFile(file => {
		setStoredKey('other', 'x');
		writeFileSync(file, '{not json');
		// Different path forces a reload past the in-memory cache.
		process.env.TOOLCODE_AUTH_FILE = file + '.bak';
		writeFileSync(file + '.bak', '{not json');
		assert.equal(getStoredKey('acme'), undefined);
		setStoredKey('acme', 'sk-new');
		assert.deepEqual(JSON.parse(readFileSync(file + '.bak', 'utf8')), {acme: 'sk-new'});
	}));
