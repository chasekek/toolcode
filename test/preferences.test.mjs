import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {loadModelChoice, saveModelChoice} from '../dist/providers/preferences.js';
import {tempDir} from './helpers.mjs';

async function withPrefsFile(run) {
	const {dir, cleanup} = await tempDir();
	const previous = process.env.TOOLCODE_PREFS_FILE;
	const file = path.join(dir, 'nested', 'preferences.json');
	process.env.TOOLCODE_PREFS_FILE = file;
	try {
		await run(file);
	} finally {
		if (previous === undefined) delete process.env.TOOLCODE_PREFS_FILE;
		else process.env.TOOLCODE_PREFS_FILE = previous;
		await cleanup();
	}
}

test('nothing saved means no remembered model', () =>
	withPrefsFile(() => assert.equal(loadModelChoice(), undefined)));

test('the last saved model is read back', () =>
	withPrefsFile(() => {
		saveModelChoice({providerId: 'openrouter', model: 'a/b'});
		saveModelChoice({providerId: 'groq', model: 'c'});
		assert.deepEqual(loadModelChoice(), {providerId: 'groq', model: 'c'});
	}));

test('a corrupt or malformed file is ignored', () =>
	withPrefsFile(file => {
		saveModelChoice({providerId: 'x', model: 'y'});
		writeFileSync(file, '{nope');
		assert.equal(loadModelChoice(), undefined);
		writeFileSync(file, JSON.stringify({providerId: 1}));
		assert.equal(loadModelChoice(), undefined);
	}));
