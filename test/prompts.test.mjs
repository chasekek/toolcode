import {test} from 'node:test';
import assert from 'node:assert/strict';
import {systemPrompt, toolHints} from '../dist/core/prompts.js';
import {normalizeTool} from '../dist/plugins/normalize.js';
import {tempDir} from './helpers.mjs';

const jev = normalizeTool({name: 'jev_judge', description: 'x', keywords: ['judge', 'jev'], run: () => ''});
const jeff = normalizeTool({name: 'jeff_judge', description: 'x', keywords: ['Judge', 'jeff'], run: () => ''});
const other = normalizeTool({name: 'list_files', description: 'x', run: () => ''});
const tools = [jev, jeff, other];
const names = hints => ({
	requested: hints.requested.map(t => t.name),
	suggested: hints.suggested.map(g => [g.keyword, g.tools.map(t => t.name)]),
});

test('keywords suggest tools, whole-word prefix and case-insensitive', () => {
	assert.deepEqual(names(toolHints('chat', 'Judge whether this loop terminates', tools)), {
		requested: [],
		suggested: [['judge', ['jev_judge', 'jeff_judge']]],
	});
	assert.deepEqual(names(toolHints('chat', 'try judging it with jeff', tools)).suggested, [
		['judge', ['jev_judge', 'jeff_judge']],
	]);
	assert.deepEqual(names(toolHints('chat', 'prejudge nothing', tools)).suggested, []);
	assert.deepEqual(names(toolHints('chat', 'fix the bug', tools)).suggested, []);
});

test('@name asks for a tool outright, and /judge turns count as saying judge', () => {
	assert.deepEqual(names(toolHints('chat', 'check this with @jeff_judge please', tools)), {
		requested: ['jeff_judge'],
		suggested: [],
	});
	assert.deepEqual(names(toolHints('chat', 'mail me@jev_judge.com', tools)).requested, []);
	assert.deepEqual(names(toolHints('judge', '', tools)).suggested, [['judge', ['jev_judge', 'jeff_judge']]]);
});

test('the system prompt carries the hint, and only for offered tools', () => {
	const {dir, cleanup} = tempDir();
	try {
		const prompt = systemPrompt('chat', dir, tools, 'judge whether it is safe');
		assert.match(prompt, /says "judge", and jev_judge or jeff_judge are built for that/);
		assert.doesNotMatch(systemPrompt('chat', dir, [other], 'judge whether it is safe'), /built for that/);
		assert.doesNotMatch(systemPrompt('chat', dir, tools, 'hello'), /built for that/);
	} finally {
		cleanup();
	}
});

test('bad keywords reject the tool', () => {
	assert.throws(() => normalizeTool({name: 'bad', description: 'x', keywords: 'judge', run: () => ''}), /keywords/);
	assert.throws(() => normalizeTool({name: 'bad', description: 'x', keywords: [''], run: () => ''}), /keywords/);
});
