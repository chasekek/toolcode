import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Runs a scripted scenario of scripts/ui-smoke.mjs and returns the named frames. */
function scenario(name, {width = 100, height = 32, env = {}} = {}) {
	const out = execFileSync(process.execPath, ['scripts/ui-smoke.mjs', String(width), name, String(height)], {
		encoding: 'utf8',
		env: {...process.env, OPENROUTER_API_KEY: '', TOOLCODE_AUTH_FILE: path.join(os.tmpdir(), 'toolcode-no-auth.json'), TOOLCODE_PREFS_FILE: path.join(os.tmpdir(), 'toolcode-no-prefs.json'), TOOLCODE_CONFIG_FILE: path.join(os.tmpdir(), 'toolcode-no-config.json'), TOOLCODE_DELEGATION_DEPTH: '', ...env},
	});
	const frames = {};
	for (const block of out.split('\n===== ').slice(1)) {
		const newline = block.indexOf('\n');
		frames[block.slice(0, newline)] = block.slice(newline + 1);
	}
	return frames;
}

test('ask panel: recommended option, free text, answers reach the model, todos render', () => {
	// Wide enough that the echoed answers fit on one line of the chat panel.
	const f = scenario('agent', {width: 140});
	assert.match(f['ask q1'], /─Question─+ 1\/2 ─/);
	assert.match(f['ask q1'], /Which framework\?/);
	assert.match(f['ask q1'], /❯ 2\. Vue \(recommended\)/);
	assert.match(f['ask q1'], /No framework in package\.json yet\./);
	assert.match(f['ask q1'], /Waiting for your answer/);
	assert.match(f['ask q2'], /─ 2\/2 ─/);
	assert.match(f['ask q2'], /Project name\?/);
	assert.match(f['after answers'], /A: Vue \| {2}\| Q: Project name\? \| A: demo/);
	assert.match(f['after answers'], /─\[2\]─Todos/);
	assert.match(f['after answers'], /━+─+ 33%/);
	assert.match(f['after answers'], /▶ Add router/);
	assert.match(f['after answers'], /✓ Todos 3 tasks/);
	assert.doesNotMatch(f['after answers'], /─Question─/, 'the popup closes after answering');
});

test('esc skips the questions without interrupting the turn', () => {
	const f = scenario('agent-skip');
	assert.match(f['skipped'], /Skipped by user/);
	assert.match(f['skipped'], /Got: no answers/);
	assert.doesNotMatch(f['skipped'], /Interrupted/);
});

test('/orchestrate switches modes and reports agent availability', () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'toolcode-ui-orch-'));
	try {
		const config = path.join(dir, 'config.json');
		writeFileSync(config, JSON.stringify({agents: {'claude-code': {command: path.join(dir, 'missing', 'claude')}}}));
		const f = scenario('orchestrate', {width: 140, env: {TOOLCODE_CONFIG_FILE: config}});
		assert.match(f['orchestrator on'], /Prompt · orchestrator/);
		assert.match(f['orchestrator on'], /Mode +◆ orchestrator/);
		assert.match(f['orchestrator on'], /Orchestrator mode on/);
		assert.match(f['orchestrator on'], /Claude Code: unavailable. The configured command/);
		assert.match(f['agents'], /Orchestrator mode: on/);
		assert.match(f['agents'], /commands ask · timeout 20 min/);
		assert.match(f['orchestrator off'], /Orchestrator mode off./);
		assert.doesNotMatch(f['orchestrator off'], /Prompt · orchestrator/);
	} finally {
		rmSync(dir, {recursive: true, force: true});
	}
});

test('/auth saves a masked key, then removes it', () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'toolcode-ui-auth-'));
	try {
		const f = scenario('auth', {env: {TOOLCODE_AUTH_FILE: path.join(dir, 'auth.json')}});
		assert.match(f['auth list'], /─API keys─/);
		assert.match(f['auth list'], /❯ OpenRouter +not set/);
		assert.match(f['auth typing'], /❯ •{12}/);
		assert.doesNotMatch(f['auth typing'], /sk-or-secret/, 'the key is never drawn');
		assert.match(f['auth saved'], /Saved API key for OpenRouter\./);
		assert.match(f['auth saved'], /Key +● saved/);
		assert.match(f['auth removed'], /Removed saved API key for OpenRouter\./);
		assert.match(f['auth removed'], /OpenRouter +not set/);
		assert.match(f['auth unknown'], /Unknown provider "nope"/);
	} finally {
		rmSync(dir, {recursive: true, force: true});
	}
});

test('marketplace: install hello world, run /helloworld, uninstall', () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'toolcode-ui-mp-'));
	try {
		const f = scenario('marketplace', {env: {TOOLCODE_PLUGIN_DIR: dir}});
		// The popup: header mark, category filter, selected row, detail pane.
		assert.match(f['marketplace'], /◈ MARKETPLACE/);
		assert.match(f['marketplace'], /❯ all \d+ {5}tool \d+ {5}provider \d+ {5}command \d+/);
		assert.match(f['marketplace'], /▌▸ Hello World +· install/);
		assert.match(f['marketplace'], /▸ Hello World · command/);
		// Tab filters to tools, and the number keys jump straight to a category.
		assert.match(f['filter tools'], /❯ tool \d+/);
		assert.match(f['filter tools'], /▌⚒ \S.* · install/);
		assert.doesNotMatch(f['filter tools'], /Hello World/);
		assert.match(f['filter providers'], /❯ provider \d+/);
		assert.match(f['filter providers'], /▌⚡\S.* · install/);
		assert.doesNotMatch(f['filter providers'], /List Files/);
		assert.match(f['installed'], /✓ installed/);
		assert.match(f['installed'], /Installed Hello World: try \/helloworld\./);
		assert.match(f['menu'], /\/helloworld +Reply with hello world/);
		assert.match(f['hello'], /❯ \/helloworld[\s\S]*● hello world/);
		assert.match(f['uninstalled'], /Uninstalled Hello World\./);
		assert.match(f['after uninstall'], /Unknown command \/helloworld/);
	} finally {
		rmSync(dir, {recursive: true, force: true});
	}
});

test('marketplace: a plugin already loaded from --plugin is not offered as installable', () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'toolcode-ui-mpl-'));
	try {
		const f = scenario('marketplace-loaded', {width: 100, env: {TOOLCODE_PLUGIN_DIR: dir}});
		// Every catalog copy is registered by --plugin plugins, so nothing is installable.
		assert.match(f['marketplace'], /▌▸ Hello World +✓ loaded/);
		assert.doesNotMatch(f['marketplace'], /· install {3}/);
		assert.match(f['marketplace'], /⏎ already loaded/);
		// Enter explains where it runs from rather than failing on a name collision.
		assert.match(f['install refused'], /✓ Already loaded from plugins\/commands\/hello-world\.js; remove it there to install\./);
		assert.doesNotMatch(f['install refused'], /✕/);
		assert.match(f['filter tools'], /❯ tool \d+/);
		assert.doesNotMatch(f['closed'], /─Marketplace─/, 'esc still closes');
	} finally {
		rmSync(dir, {recursive: true, force: true});
	}
});

test('side panels track the session and drive the main view', () => {
	const f = scenario('panels', {width: 110});
	assert.match(f['built'], /━+─+ 75%/);
	assert.match(f['built'], /A src\/app\.ts +\+18/);
	assert.match(f['built'], /A notes\.md +\+3/);
	assert.match(f['built'], /D legacy\.js/);
	assert.match(f['built'], /3 changed/);
	assert.match(f['built'], /6 calls/);
	// Tab walks from the prompt into the panels; the main panel shows what the focus selects.
	assert.match(f['focus chat'], /Press esc or i to type/);
	assert.match(f['focus session'], /─\[0\]─Overview/);
	assert.match(f['focus session'], /Workspace +no key needed/);
	assert.match(f['focus todos'], /─\[0\]─Plan/);
	assert.match(f['focus todos'], /3 of 4 done/);
	assert.match(f['focus todos'], /4 +▶ Remove legacy code +after 2/);
	assert.match(f['focus files'], /─\[0\]─File─+ 1 of 3 ─/);
	assert.match(f['focus files'], /10 │ {3}'\/version': \(\) => '1\.0\.0',/, 'tabs become spaces');
	assert.match(f['next file'], /─ 2 of 3 ─/);
	assert.match(f['next file'], /1 │ # Notes/);
	assert.match(f['focus tools'], /─\[0\]─Output─+ 6 of 6 ─/);
	assert.match(f['focus tools'], /\[doing\] 4\. Remove legacy code/);
	assert.match(f['previous tool'], /✓ Delete legacy\.js/);
	assert.match(f['back to prompt'], /─\[0\]─Chat/);
	assert.match(f['back to prompt'], /Ask TOOLCODE anything/);
});

test('the conversation scrolls, and says how much is below', () => {
	const f = scenario('scroll', {height: 24});
	assert.match(f['pinned'], /Everything above ran in plan-free mode/);
	assert.doesNotMatch(f['pinned'], /more ↓/);
	assert.match(f['page up'], /─ \d+ more ↓ ─/);
	assert.match(f['top'], /❯ build a server/);
	assert.doesNotMatch(f['top'], /Everything above ran/);
	assert.match(f['bottom again'], /Everything above ran in plan-free mode/);
	assert.doesNotMatch(f['bottom again'], /more ↓/);
});

test('mouse: click a file to open it, click the prompt to type', () => {
	const f = scenario('mouse', {height: 26});
	assert.match(f['clicked file'], /─\[0\]─File─+ 3 of 3 ─/);
	assert.match(f['clicked file'], /The file was deleted\./);
	assert.match(f['typing works'], /❯ typed after click/);
});

test('narrow terminals drop the sidebar, tiny ones say so', () => {
	const f = scenario('narrow', {width: 70, height: 24});
	assert.doesNotMatch(f['narrow'], /Session/);
	assert.match(f['narrow'], /─Todos─/);
	assert.match(f['narrow'], /▶ Remove legacy code/);
	assert.match(f['narrowest'], /─\[0\]─Chat/);
	assert.match(f['too small'], /Terminal too small/);
});
