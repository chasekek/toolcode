import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {claudeArgs, createClaudeCode, parseStream} from '../dist/agents/claudeCode.js';
import {canDelegate, loadConfig} from '../dist/agents/config.js';
import {buildTaskPrompt, scopeChanges} from '../dist/agents/delegate.js';
import {compareSnapshots, GIT_READ_ONLY, snapshotWorkspace} from '../dist/agents/git.js';
import {delegationIntent} from '../dist/agents/intent.js';
import {canRunTogether, parseTaskPlan, runTaskGraph} from '../dist/agents/orchestrate.js';
import {findExecutable, needsShell, runProcess} from '../dist/agents/process.js';
import {agents, registerAgent, unregisterAgent} from '../dist/agents/registry.js';
import {runTurn, scriptedProvider, tempDir} from './helpers.mjs';

const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
const ok = (stdout = '', extra = {}) => ({exitCode: 0, stdout, stderr: '', timedOut: false, aborted: false, ...extra});

/** A runner that records calls and answers from a script. */
function fakeRunner(answer = () => ok()) {
	const calls = [];
	return {calls, runner: async options => (calls.push(options), answer(options))};
}

function request(over = {}) {
	return {prompt: 'TASK', cwd: process.cwd(), mode: 'implement', allowCommands: false, timeoutMs: 1000, signal: new AbortController().signal, ...over};
}

const config = (over = {}) => () => ({enabled: true, timeoutMinutes: 20, defaultMode: 'implement', commands: 'ask', ...over});

function withEnv(vars, run) {
	const previous = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
	Object.assign(process.env, vars);
	const restore = () => {
		for (const [k, v] of Object.entries(previous)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	};
	return Promise.resolve().then(run).finally(restore);
}

function git(dir, ...args) {
	execFileSync('git', args, {cwd: dir, stdio: 'ignore'});
}

function gitRepo() {
	const temp = tempDir();
	git(temp.dir, 'init', '-q');
	git(temp.dir, 'config', 'user.email', 't@t');
	git(temp.dir, 'config', 'user.name', 't');
	git(temp.dir, 'config', 'commit.gpgsign', 'false');
	return temp;
}

// --- Detection ---------------------------------------------------------------

test('detects Claude Code on PATH and reads its version', async () => {
	const {dir, cleanup} = tempDir();
	try {
		writeFileSync(path.join(dir, exe), '');
		const {calls, runner} = fakeRunner(() => ok('2.1.0 (Claude Code)\n'));
		const claude = createClaudeCode({runner, config: config(), env: {PATH: dir, PATHEXT: '.EXE'}, home: dir});
		const found = await claude.detect();
		assert.equal(found.available, true);
		assert.equal(found.version, '2.1.0 (Claude Code)');
		assert.equal(found.command, path.join(dir, exe));
		assert.deepEqual(calls[0].args, ['--version']);
	} finally {
		cleanup();
	}
});

test('reports Claude Code as not installed when it is nowhere to be found', async () => {
	const {dir, cleanup} = tempDir();
	try {
		const {calls, runner} = fakeRunner();
		const claude = createClaudeCode({runner, config: config(), env: {PATH: dir}, home: dir});
		const found = await claude.detect();
		assert.equal(found.available, false);
		assert.match(found.reason, /not installed/);
		assert.equal(calls.length, 0);
		const run = await claude.run(request());
		assert.equal(run.status, 'not_installed');
	} finally {
		cleanup();
	}
});

test('a configured executable path that does not exist is reported, not replaced', async () => {
	const {dir, cleanup} = tempDir();
	try {
		writeFileSync(path.join(dir, exe), '');
		const missing = path.join(dir, 'nope', exe);
		const claude = createClaudeCode({runner: fakeRunner().runner, config: config({command: missing}), env: {PATH: dir}, home: dir});
		const found = await claude.detect();
		assert.equal(found.available, false);
		assert.match(found.reason, /configured command/);
	} finally {
		cleanup();
	}
});

test('a broken executable fails detection', async () => {
	const {dir, cleanup} = tempDir();
	try {
		writeFileSync(path.join(dir, exe), '');
		const {runner} = fakeRunner(() => ({...ok(), exitCode: 1}));
		const found = await createClaudeCode({runner, config: config(), env: {PATH: dir, PATHEXT: '.EXE'}, home: dir}).detect();
		assert.equal(found.available, false);
		assert.match(found.reason, /--version" failed/);
	} finally {
		cleanup();
	}
});

test('findExecutable honours PATHEXT on Windows and needsShell flags .cmd shims', () => {
	const {dir, cleanup} = tempDir();
	try {
		writeFileSync(path.join(dir, 'tool.cmd'), '');
		assert.equal(findExecutable('tool', {PATH: dir, PATHEXT: '.EXE;.CMD'}, 'win32'), path.join(dir, 'tool.cmd'));
		assert.equal(findExecutable('tool', {PATH: dir}, 'linux'), undefined);
		assert.equal(needsShell('C:/x/claude.cmd', 'win32'), true);
		assert.equal(needsShell('C:/x/claude.exe', 'win32'), false);
		assert.equal(needsShell('/x/claude.cmd', 'linux'), false);
	} finally {
		cleanup();
	}
});

// --- Invocation --------------------------------------------------------------

test('runs Claude Code headless in the working directory, with the prompt on stdin', async () => {
	const {dir, cleanup} = tempDir();
	try {
		writeFileSync(path.join(dir, exe), '');
		const {calls, runner} = fakeRunner(() => ok());
		const claude = createClaudeCode({runner, config: config({model: 'sonnet'}), env: {PATH: dir, PATHEXT: '.EXE', TOOLCODE_DELEGATION_DEPTH: '0', KEEP: 'me'}, home: dir});
		await claude.run(request({cwd: dir, prompt: 'Refactor "auth" & run; rm -rf /'}));
		const [call] = calls;
		assert.equal(call.cwd, dir);
		assert.equal(call.input, 'Refactor "auth" & run; rm -rf /');
		assert.ok(!call.args.some(a => a.includes('Refactor')), 'the prompt never reaches the command line');
		assert.deepEqual(call.args.slice(0, 4), ['-p', '--output-format', 'stream-json', '--verbose']);
		assert.deepEqual(call.args.slice(-2), ['--model', 'sonnet']);
		assert.equal(call.env.TOOLCODE_DELEGATION_DEPTH, '1', 'the agent is marked as delegated');
		assert.equal(call.env.KEEP, 'me');
	} finally {
		cleanup();
	}
});

test('permissions map to Claude Code flags and never bypass its checks', () => {
	const cfg = config()();
	const edit = claudeArgs({mode: 'implement', allowCommands: false}, cfg);
	assert.deepEqual(edit.slice(edit.indexOf('--permission-mode'), edit.indexOf('--permission-mode') + 2), ['--permission-mode', 'acceptEdits']);
	assert.ok(edit.includes('--disallowedTools') && edit.includes('Bash'));
	const commands = claudeArgs({mode: 'implement', allowCommands: true}, cfg);
	assert.ok(commands.includes('--allowedTools') && !commands.includes('--disallowedTools'));
	const look = claudeArgs({mode: 'investigate', allowCommands: true}, cfg);
	assert.ok(look.includes('plan') && look.includes('--disallowedTools'), 'investigating never runs commands');
	for (const args of [edit, commands, look]) assert.ok(!args.includes('bypassPermissions') && !args.some(a => a.includes('dangerously')));
	assert.ok(!claudeArgs({mode: 'implement', allowCommands: false}, {...cfg, model: 'x; rm -rf'}).includes('--model'));
});

test('stream output becomes a structured result', async () => {
	const stdout = [
		JSON.stringify({type: 'system', subtype: 'init'}),
		JSON.stringify({type: 'assistant', message: {content: [{type: 'tool_use', name: 'Write', input: {file_path: '/w/a.ts'}}, {type: 'tool_use', name: 'Bash', input: {command: 'npm test'}}]}}),
		'not json',
		JSON.stringify({type: 'result', subtype: 'success', is_error: false, result: 'Refactored auth.', num_turns: 4, total_cost_usd: 0.1, permission_denials: [{tool_name: 'Bash', tool_input: {command: 'rm -rf build'}}]}),
	].join('\n');
	const {dir, cleanup} = tempDir();
	try {
		writeFileSync(path.join(dir, exe), '');
		const claude = createClaudeCode({runner: async () => ok(stdout, {stderr: 'warn'}), config: config(), env: {PATH: dir, PATHEXT: '.EXE'}, home: dir});
		const result = await claude.run(request());
		assert.equal(result.status, 'success');
		assert.equal(result.exitCode, 0);
		assert.equal(result.summary, 'Refactored auth.');
		assert.deepEqual(result.commandsRun, ['npm test']);
		assert.deepEqual(result.filesTouched, ['/w/a.ts']);
		assert.deepEqual(result.permissionDenials, ['Bash: rm -rf build']);
		assert.equal(result.stderr, 'warn');
		assert.equal(result.turns, 4);
	} finally {
		cleanup();
	}
});

test('exit codes, timeouts and spawn errors map to distinct statuses', async () => {
	const {dir, cleanup} = tempDir();
	try {
		writeFileSync(path.join(dir, exe), '');
		const statusFor = async proc => (await createClaudeCode({runner: async () => ({...ok(), ...proc}), config: config(), env: {PATH: dir, PATHEXT: '.EXE'}, home: dir}).run(request())).status;
		const errorResult = JSON.stringify({type: 'result', is_error: true, subtype: 'error_max_turns', result: 'gave up'});
		assert.equal(await statusFor({exitCode: 1, stdout: errorResult}), 'failure');
		assert.equal(await statusFor({exitCode: 0, stdout: errorResult}), 'failure', 'is_error wins over exit 0');
		assert.equal(await statusFor({exitCode: null, timedOut: true}), 'timeout');
		assert.equal(await statusFor({exitCode: null, error: {code: 'ENOENT', message: 'spawn ENOENT'}}), 'not_installed');
		assert.equal(await statusFor({exitCode: null, error: {code: 'EACCES', message: 'spawn EACCES'}}), 'permission_error');
		assert.equal(await statusFor({exitCode: 1, stderr: 'Error: EACCES: permission denied, open x'}), 'permission_error');
		assert.equal(await statusFor({exitCode: null}), 'unknown_error');
		// Plain text output (an older CLI) still yields a summary, but no invented details.
		const plain = await createClaudeCode({runner: async () => ok('All done.'), config: config(), env: {PATH: dir, PATHEXT: '.EXE'}, home: dir}).run(request());
		assert.equal(plain.summary, 'All done.');
		assert.equal(plain.commandsRun, undefined);
		assert.equal(parseStream('').parsed, false);
	} finally {
		cleanup();
	}
});

test('runProcess captures stdout, stderr, exit code, stdin, cwd and env', async () => {
	const {dir, cleanup} = tempDir();
	try {
		const script = `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{process.stdout.write(s+'|'+process.cwd()+'|'+process.env.PROBE);process.stderr.write('oops');process.exit(3)})`;
		const result = await runProcess({command: process.execPath, args: ['-e', script], cwd: dir, env: {...process.env, PROBE: 'yes'}, input: 'hello'});
		const [input, cwd, probe] = result.stdout.split('|');
		assert.equal(input, 'hello');
		assert.equal(path.resolve(cwd).toLowerCase(), path.resolve(dir).toLowerCase());
		assert.equal(probe, 'yes');
		assert.equal(result.stderr, 'oops');
		assert.equal(result.exitCode, 3);
		assert.equal(result.timedOut, false);
	} finally {
		cleanup();
	}
});

test('runProcess times out and kills the process, and reports a missing command', async () => {
	const slow = await runProcess({command: process.execPath, args: ['-e', 'setTimeout(()=>{}, 60000)'], cwd: process.cwd(), timeoutMs: 300});
	assert.equal(slow.timedOut, true);
	const missing = await runProcess({command: 'toolcode-no-such-binary', args: [], cwd: process.cwd()});
	assert.equal(missing.error?.code, 'ENOENT');
	const controller = new AbortController();
	setTimeout(() => controller.abort(), 200);
	const aborted = await runProcess({command: process.execPath, args: ['-e', 'setTimeout(()=>{}, 60000)'], cwd: process.cwd(), signal: controller.signal});
	assert.equal(aborted.aborted, true);
});

// --- Delegation through the agent loop --------------------------------------

/** A stand-in agent that edits the workspace the way a real CLI would. */
function fakeAgent(behaviour) {
	const runs = [];
	return {
		runs,
		agent: {
			id: 'fake',
			name: 'Fake Agent',
			description: 'test double',
			aliases: ['fake agent'],
			capabilities: {coding: true, terminal: false, filesystem: true, autonomous: true},
			detect: async () => ({available: true}),
			async run(req) {
				runs.push(req);
				return behaviour(req, runs.length);
			},
		},
	};
}

/** Disables Claude Code via config and registers a fake agent for the duration. */
async function withFakeAgent(behaviour, run, configOver = {}) {
	const {dir: configDir, cleanup: cleanConfig} = tempDir();
	const file = path.join(configDir, 'config.json');
	writeFileSync(file, JSON.stringify({agents: {'claude-code': {enabled: false}, fake: {commands: 'allow'}}, ...configOver}));
	const fake = fakeAgent(behaviour);
	registerAgent(fake.agent);
	try {
		await withEnv({TOOLCODE_CONFIG_FILE: file, TOOLCODE_DELEGATION_DEPTH: '0'}, () => run(fake));
	} finally {
		unregisterAgent('fake');
		cleanConfig();
	}
}

const success = (summary = 'done') => ({status: 'success', exitCode: 0, stdout: '', stderr: '', summary, commandsRun: []});

test('the model can delegate, and gets back status, real file changes and the summary', async () => {
	const repo = gitRepo();
	try {
		writeFileSync(path.join(repo.dir, 'old.txt'), 'x\n');
		git(repo.dir, 'add', '.');
		git(repo.dir, 'commit', '-qm', 'init');
		await withFakeAgent(
			req => {
				writeFileSync(path.join(req.cwd, 'new.txt'), 'hi\n');
				writeFileSync(path.join(req.cwd, 'old.txt'), 'changed\n');
				return success('Added new.txt');
			},
			async fake => {
				const {provider, requests} = scriptedProvider([[{name: 'delegate', args: {task: 'Add new.txt', context: 'ctx', files: ['old.txt']}}], 'ok']);
				const {toolEnds, history} = await runTurn({provider, cwd: repo.dir, input: 'add a file'});
				assert.ok(requests[0].tools.some(t => t.name === 'delegate'), 'offered without being asked');
				assert.match(requests[0].messages[0].content, /Delegate when another agent would clearly do the work better/);
				assert.equal(toolEnds[0].status, 'success');
				assert.equal(toolEnds[0].summary, 'Fake Agent finished: 2 files changed');
				const content = history.find(m => m.role === 'tool').content;
				assert.match(content, /status: success/);
				assert.match(content, /added: new\.txt/);
				assert.match(content, /modified: old\.txt/);
				assert.match(content, /Added new\.txt/);
				assert.match(fake.runs[0].prompt, /OBJECTIVE\nAdd new\.txt/);
				assert.match(fake.runs[0].prompt, /CONTEXT\nctx/);
				assert.match(fake.runs[0].prompt, /- old\.txt/);
				assert.equal(fake.runs[0].cwd, repo.dir);
			},
		);
	} finally {
		repo.cleanup();
	}
});

test('an explicit request to use an agent becomes a rule the model must follow', async () => {
	await withFakeAgent(success, async () => {
		const {provider, requests} = scriptedProvider(['ok']);
		await runTurn({provider, cwd: process.cwd(), input: 'Have Fake Agent implement the database migration'});
		assert.match(requests[0].messages[0].content, /The user explicitly asked for Fake Agent: use delegate with agent "fake"/);
		const intent = delegationIntent('Use Claude Code for this.', agents);
		assert.equal(intent.require, true);
		assert.equal(intent.agent?.id, 'claude-code');
		for (const text of ['Delegate this to Claude Code.', 'Ask Claude Code to fix the tests.', 'Let Claude Code handle the frontend.', 'Use Claude Code as a subagent.', 'Have another AI CLI do this.', 'Delegate this entire task.']) {
			assert.equal(delegationIntent(text, agents).require, true, text);
		}
		assert.equal(delegationIntent('Fix the Claude Code detection bug', agents).require, false);
		assert.equal(delegationIntent("Don't use parallel agents.", agents).noParallel, true);
	});
});

test('"do it yourself" removes the delegation tools for that turn', async () => {
	await withFakeAgent(success, async () => {
		for (const input of ["Don't delegate this.", 'Do this yourself.', 'Fix it without using a subagent']) {
			const {provider, requests} = scriptedProvider(['ok']);
			await runTurn({provider, cwd: process.cwd(), input, orchestrator: true});
			assert.ok(!requests[0].tools.some(t => t.name.startsWith('delegate')), input);
			assert.match(requests[0].messages[0].content, /do not hand it to another agent/);
		}
	});
});

test('a failed delegation is an error result the model can act on, and repeats are capped', async () => {
	await withFakeAgent(
		() => ({status: 'failure', exitCode: 1, stdout: '', stderr: 'boom', summary: 'Tests still fail'}),
		async fake => {
			const call = {name: 'delegate', args: {task: 'Fix tests'}};
			const {provider} = scriptedProvider([[call], [call], [call], 'giving up']);
			const {toolEnds, history} = await runTurn({provider, cwd: process.cwd()});
			assert.equal(toolEnds[0].status, 'error');
			assert.match(history.find(m => m.role === 'tool').content, /status: failure[\s\S]*stderr \(tail\):\nboom/);
			assert.equal(toolEnds[2].status, 'error');
			assert.match(toolEnds[2].summary, /already delegated 2 times/);
			assert.equal(fake.runs.length, 2, 'the third identical attempt never ran');
		},
	);
});

test('commands are only granted with approval, and denied without anyone to ask', async () => {
	await withFakeAgent(
		success,
		async fake => {
			const call = {name: 'delegate', args: {task: 'Run the tests', allow_commands: true}};
			const asked = [];
			const {provider} = scriptedProvider([[call], 'ok']);
			await runTurn({provider, cwd: process.cwd(), ask: async q => (asked.push(q), ['Deny'])});
			assert.equal(asked.length, 1);
			assert.equal(fake.runs[0].allowCommands, false);
			const second = scriptedProvider([[{name: 'delegate', args: {task: 'Run tests again', allow_commands: true}}], 'ok']);
			await runTurn({provider: second.provider, cwd: process.cwd(), ask: async () => ['Allow']});
			assert.equal(fake.runs[1].allowCommands, true);
			const third = scriptedProvider([[{name: 'delegate', args: {task: 'Run tests once more', allow_commands: true}}], 'ok']);
			await runTurn({provider: third.provider, cwd: process.cwd()});
			assert.equal(fake.runs[2].allowCommands, false, 'no UI means no approval');
		},
		{agents: {'claude-code': {enabled: false}, fake: {commands: 'ask'}}},
	);
});

test('delegation is not offered inside a delegated agent, so chains cannot form', async () => {
	await withFakeAgent(success, async () => {
		await withEnv({TOOLCODE_DELEGATION_DEPTH: '1'}, async () => {
			assert.equal(canDelegate(loadConfig()), false);
			const {provider, requests} = scriptedProvider(['ok']);
			await runTurn({provider, cwd: process.cwd(), orchestrator: true});
			assert.ok(!requests[0].tools.some(t => t.name.startsWith('delegate')));
		});
	});
});

test('orchestrator mode adds delegate_tasks and the coordinator role', async () => {
	await withFakeAgent(success, async () => {
		const normal = scriptedProvider(['ok']);
		await runTurn({provider: normal.provider, cwd: process.cwd()});
		assert.ok(!normal.requests[0].tools.some(t => t.name === 'delegate_tasks'));
		const orchestrated = scriptedProvider(['ok']);
		await runTurn({provider: orchestrated.provider, cwd: process.cwd(), orchestrator: true});
		assert.ok(orchestrated.requests[0].tools.some(t => t.name === 'delegate_tasks'));
		assert.match(orchestrated.requests[0].messages[0].content, /^You are TOOLCODE in orchestrator mode/);
		assert.match(orchestrated.requests[0].messages[0].content, /split it into subtasks/);
	});
});

test('delegate_tasks runs a plan through the agent loop and reports every task', async () => {
	await withFakeAgent(
		req => (req.prompt.includes('break') ? {status: 'not_installed', exitCode: null, stdout: '', stderr: '', summary: 'missing'} : success(req.prompt.match(/OBJECTIVE\n(.*)/)[1])),
		async fake => {
			const tasks = [
				{id: 'api', task: 'Build API', files: ['src/api']},
				{id: 'ui', task: 'Build UI', files: ['src/ui']},
				{id: 'broken', task: 'break things'},
				{id: 'tests', task: 'Write tests', depends_on: ['api', 'ui']},
				{id: 'after-broken', task: 'Use broken', depends_on: ['broken']},
			];
			const {provider} = scriptedProvider([[{name: 'delegate_tasks', args: {tasks}}], 'ok']);
			const {toolEnds, history} = await runTurn({provider, cwd: process.cwd(), orchestrator: true});
			assert.equal(toolEnds[0].status, 'error');
			assert.equal(toolEnds[0].summary, '3/5 tasks done, 1 failed, 1 skipped');
			const content = history.find(m => m.role === 'tool').content;
			assert.match(content, /## broken: failed/);
			assert.match(content, /## after-broken: skipped\nreason: depends on "broken"/);
			assert.match(content, /## combined workspace changes/);
			const order = fake.runs.map(r => r.prompt.match(/OBJECTIVE\n(.*)/)[1]);
			assert.ok(order.indexOf('Write tests') > order.indexOf('Build API') && order.indexOf('Write tests') > order.indexOf('Build UI'));
			assert.equal(order.filter(o => o === 'break things').length, 1, 'a missing agent is not retried');
		},
	);
});

// --- Orchestration scheduling -----------------------------------------------

function plan(tasks) {
	return parseTaskPlan(tasks);
}

/** Runs a graph with fake work that records concurrency and order. */
async function schedule(tasks, {fail = {}, maxParallel = 3, maxRetries = 1} = {}) {
	let running = 0;
	let peak = 0;
	const started = [];
	const outcomes = await runTaskGraph(
		plan(tasks),
		async (task, attempt) => {
			started.push(`${task.id}#${attempt}`);
			running++;
			peak = Math.max(peak, running);
			await new Promise(r => setTimeout(r, 20));
			running--;
			const status = typeof fail[task.id] === 'function' ? fail[task.id](attempt) : fail[task.id];
			return {status: status ?? 'success'};
		},
		{maxParallel, maxRetries, signal: new AbortController().signal},
	);
	return {outcomes, peak, started};
}

test('a single task runs once', async () => {
	const {outcomes, started} = await schedule([{id: 'a', task: 'A'}]);
	assert.deepEqual(started, ['a#1']);
	assert.equal(outcomes[0].state, 'success');
});

test('independent tasks with separate files run in parallel, up to the limit', async () => {
	const tasks = [
		{id: 'a', task: 'A', files: ['src/a']},
		{id: 'b', task: 'B', files: ['src/b']},
		{id: 'c', task: 'C', files: ['src/c']},
	];
	assert.equal((await schedule(tasks)).peak, 3);
	assert.equal((await schedule(tasks, {maxParallel: 2})).peak, 2);
	assert.equal((await schedule(tasks, {maxParallel: 1})).peak, 1);
});

test('editing tasks that may touch the same files never run together', async () => {
	assert.equal((await schedule([{id: 'a', task: 'A'}, {id: 'b', task: 'B'}])).peak, 1, 'undeclared files run alone');
	assert.equal((await schedule([{id: 'a', task: 'A', files: ['src']}, {id: 'b', task: 'B', files: ['src/x.ts']}])).peak, 1);
	assert.equal((await schedule([{id: 'a', task: 'A', mode: 'investigate'}, {id: 'b', task: 'B'}])).peak, 2, 'read-only tasks can overlap');
	assert.equal(canRunTogether(plan([{id: 'a', task: 'A', files: ['./src/a/']}])[0], plan([{id: 'b', task: 'B', files: ['src/a/x.ts']}])[0]), false);
});

test('dependent tasks wait for their dependencies', async () => {
	const {started, outcomes} = await schedule([
		{id: 'tests', task: 'T', depends_on: ['backend', 'frontend']},
		{id: 'frontend', task: 'F', depends_on: ['backend']},
		{id: 'backend', task: 'B'},
	]);
	assert.deepEqual(started, ['backend#1', 'frontend#1', 'tests#1']);
	assert.ok(outcomes.every(o => o.state === 'success'));
});

test('failed tasks are retried a limited number of times, and their dependents skipped', async () => {
	const flaky = await schedule([{id: 'a', task: 'A'}], {fail: {a: n => (n === 1 ? 'timeout' : 'success')}});
	assert.deepEqual(flaky.started, ['a#1', 'a#2']);
	assert.equal(flaky.outcomes[0].state, 'success');
	assert.equal(flaky.outcomes[0].attempts, 2);

	const broken = await schedule([{id: 'a', task: 'A'}, {id: 'b', task: 'B', depends_on: ['a']}], {fail: {a: 'failure'}, maxRetries: 2});
	assert.deepEqual(broken.started, ['a#1', 'a#2', 'a#3']);
	assert.equal(broken.outcomes[0].state, 'failed');
	assert.equal(broken.outcomes[1].state, 'skipped');

	const unavailable = await schedule([{id: 'a', task: 'A'}], {fail: {a: 'not_installed'}});
	assert.deepEqual(unavailable.started, ['a#1'], 'an unavailable agent is not retried');
	assert.equal(unavailable.outcomes[0].state, 'failed');
});

test('a thrown error fails the task instead of hanging the graph', async () => {
	const outcomes = await runTaskGraph(plan([{id: 'a', task: 'A'}, {id: 'b', task: 'B', depends_on: ['a']}]), async () => {
		throw new Error('Unknown agent "x"');
	}, {maxParallel: 2, maxRetries: 1, signal: new AbortController().signal});
	assert.equal(outcomes[0].state, 'failed');
	assert.equal(outcomes[0].reason, 'Unknown agent "x"');
	assert.equal(outcomes[1].state, 'skipped');
});

test('plans with cycles, unknown dependencies or duplicate ids are rejected', () => {
	assert.throws(() => plan([{id: 'a', task: 'A', depends_on: ['b']}, {id: 'b', task: 'B', depends_on: ['a']}]), /cycle/);
	assert.throws(() => plan([{id: 'a', task: 'A', depends_on: ['zz']}]), /unknown id "zz"/);
	assert.throws(() => plan([{id: 'a', task: 'A'}, {id: 'a', task: 'B'}]), /Duplicate/);
	assert.throws(() => plan([]), /non-empty/);
});

// --- Safety: git is only ever read ------------------------------------------

test('change tracking only runs read-only git commands and keeps pre-existing work apart', async () => {
	const repo = gitRepo();
	try {
		const {dir} = repo;
		mkdirSync(path.join(dir, 'src'));
		writeFileSync(path.join(dir, 'src', 'a.ts'), 'a\n');
		writeFileSync(path.join(dir, 'b.ts'), 'b\n');
		writeFileSync(path.join(dir, 'gone.ts'), 'g\n');
		git(dir, 'add', '.');
		git(dir, 'commit', '-qm', 'init');
		// The user's own uncommitted work before the agent runs.
		writeFileSync(path.join(dir, 'src', 'a.ts'), 'user edit\n');
		writeFileSync(path.join(dir, 'b.ts'), 'user edit\n');

		const seen = [];
		const recording = async options => (seen.push(options.args[0]), runProcess(options));
		const before = await snapshotWorkspace(dir, recording);
		writeFileSync(path.join(dir, 'src', 'a.ts'), 'agent edit\n');
		writeFileSync(path.join(dir, 'c.ts'), 'new\n');
		execFileSync('git', ['rm', '-q', 'gone.ts'], {cwd: dir});
		const after = await snapshotWorkspace(dir, recording);
		const changes = await compareSnapshots(before, after, dir, recording);

		assert.deepEqual(changes.added, ['c.ts']);
		assert.deepEqual(changes.modified, ['src/a.ts']);
		assert.deepEqual(changes.deleted, ['gone.ts']);
		assert.deepEqual(changes.preexisting, ['src/a.ts'], 'a.ts was dirty before, and the agent changed it again');
		assert.ok(!changes.modified.includes('b.ts'), 'untouched user edits are not blamed on the agent');
		assert.equal(changes.headMoved, false);
		assert.match(changes.diffStat, /a\.ts/);
		assert.ok(seen.length > 0 && seen.every(cmd => GIT_READ_ONLY.includes(cmd)), `only read-only git: ${seen}`);
	} finally {
		repo.cleanup();
	}
});

test('a commit made during the run is flagged, and non-git folders report changes as unavailable', async () => {
	const repo = gitRepo();
	const plain = tempDir();
	try {
		writeFileSync(path.join(repo.dir, 'a.txt'), '1\n');
		git(repo.dir, 'add', '.');
		git(repo.dir, 'commit', '-qm', 'one');
		const before = await snapshotWorkspace(repo.dir);
		writeFileSync(path.join(repo.dir, 'a.txt'), '2\n');
		git(repo.dir, 'commit', '-qam', 'two');
		const changes = await compareSnapshots(before, await snapshotWorkspace(repo.dir), repo.dir);
		assert.equal(changes.headMoved, true);

		const none = await compareSnapshots(await snapshotWorkspace(plain.dir), await snapshotWorkspace(plain.dir), plain.dir);
		assert.equal(none.available, false);
	} finally {
		repo.cleanup();
		plain.cleanup();
	}
});

test('the delegated prompt is self-contained and forbids discarding work or delegating further', () => {
	const prompt = buildTaskPrompt(
		{task: 'Refactor auth', context: 'Moving to AuthService', constraints: ['Keep the public API'], workdir: path.resolve('/w/api'), mode: 'implement', allowCommands: false},
		path.resolve('/w'),
	);
	for (const heading of ['ROLE', 'OBJECTIVE', 'WORKING DIRECTORY', 'CONTEXT', 'CONSTRAINTS', 'EXPECTED RESULT', 'IMPORTANT']) assert.match(prompt, new RegExp(`^${heading}$`, 'm'));
	assert.match(prompt, /Modify the workspace directly/);
	assert.match(prompt, /Do not commit, reset, stash/);
	assert.match(prompt, /must not delegate further/);
	assert.match(prompt, /Shell commands are not available/);
	assert.match(prompt, /\(api in the workspace/);
});

test('parallel tasks are shown only the changes they own', () => {
	const root = path.resolve('/w');
	const changes = {available: true, added: ['src/a/x.js', 'src/b/y.js', 'z.js'], modified: ['src/a/old.js'], deleted: [], preexisting: [], reverted: [], headMoved: false, diffStat: 'stat'};
	const scoped = scopeChanges(changes, root, ['src/a'], [path.join(root, 'z.js')]);
	assert.deepEqual(scoped.added, ['src/a/x.js', 'z.js']);
	assert.deepEqual(scoped.modified, ['src/a/old.js']);
	assert.equal(scoped.diffStat, undefined);
});
