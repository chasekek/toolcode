// A tool plugin: drive the user's real Chrome over the DevTools Protocol, via
// the browser-harness-js SDK (https://github.com/browser-use/browser-harness-js).
//
// Copy to ~/.toolcode/plugins/tools/ to use it. The SDK is not an npm package —
// install it once with:
//
//   npx skills add https://github.com/browser-use/browser-harness-js --skill cdp
//
// This plugin talks to the harness's HTTP server directly (127.0.0.1:$CDP_REPL_PORT,
// default 9876). It starts the server itself when it can find the SDK, otherwise
// it tells you how to start it by hand.
import {execFile, spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

const run = promisify(execFile);

const HOST = '127.0.0.1';
const PORT = Number(process.env['CDP_REPL_PORT'] || 9876);
const BASE = `http://${HOST}:${PORT}`;

/** Cap what goes back to the model; a stray Page.getResourceContent can be megabytes. */
const MAX_OUTPUT = 100_000;
const START_TIMEOUT_MS = 10_000;

const CDN_DOCS = 'https://github.com/browser-use/browser-harness-js (see interaction-skills/)';

/** Where the SDK's repl.ts usually lands, depending on which agent installed the skill. */
function replCandidates() {
	const home = os.homedir();
	const roots = [process.env['BROWSER_HARNESS_REPL']].filter(Boolean);
	for (const base of [process.env['CLAUDE_SKILLS_DIR'], process.env['CURSOR_SKILLS_DIR']]) {
		if (base) roots.push(path.join(base, 'cdp', 'sdk', 'repl.ts'));
	}
	roots.push(
		path.join(home, '.claude', 'skills', 'cdp', 'sdk', 'repl.ts'),
		path.join(home, '.cursor', 'skills', 'cdp', 'sdk', 'repl.ts'),
		path.join(home, '.agents', 'skills', 'cdp', 'sdk', 'repl.ts'),
		path.join(home, '.config', 'skills', 'cdp', 'sdk', 'repl.ts'),
	);
	return roots;
}

async function health() {
	try {
		const response = await fetch(`${BASE}/health`, {signal: AbortSignal.timeout(2000)});
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

async function isUp() {
	return (await health()) !== null;
}

function onPath(command) {
	const dirs = (process.env['PATH'] || '').split(path.delimiter);
	const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
	return dirs.some(dir => exts.some(ext => existsSync(path.join(dir, command + ext))));
}

/** Starts the harness server in the background: via its CLI if on PATH, else bun + repl.ts. */
async function startServer() {
	if (onPath('browser-harness-js')) {
		await run('browser-harness-js', ['--start'], {timeout: START_TIMEOUT_MS}).catch(() => {});
	} else {
		const repl = replCandidates().find(file => file && existsSync(file));
		const bun = onPath('bun') ? 'bun' : path.join(os.homedir(), '.bun', 'bin', 'bun');
		if (!repl || !existsSync(bun)) return false;
		const child = spawn(bun, [repl], {
			detached: true,
			stdio: 'ignore',
			env: {...process.env, CDP_REPL_PORT: String(PORT)},
		});
		child.unref();
	}

	for (let waited = 0; waited < START_TIMEOUT_MS; waited += 150) {
		await new Promise(resolve => setTimeout(resolve, 150));
		if (await isUp()) return true;
	}
	return false;
}

async function ensureServer() {
	if (await isUp()) return;
	if (!(await startServer())) {
		throw new Error(
			`The browser harness server is not running on ${BASE}, and I could not start it.\n` +
				'Start it yourself, then retry:\n' +
				'  npx skills add https://github.com/browser-use/browser-harness-js --skill cdp\n' +
				'  browser-harness-js --start\n' +
				`If the SDK lives somewhere unusual, set BROWSER_HARNESS_REPL to its sdk/repl.ts. ` +
				`The port comes from CDP_REPL_PORT (default ${PORT}).`
		);
	}
}

/** Runs a snippet in the persistent harness session and returns its raw result text. */
async function evalSnippet(code, ctx) {
	if (!code || !String(code).trim()) throw new Error('The code argument is empty.');
	await ensureServer();
	const response = await fetch(`${BASE}/eval`, {
		method: 'POST',
		headers: {'content-type': 'text/plain; charset=utf-8'},
		body: String(code),
		signal: ctx?.signal,
	});
	const text = (await response.text()).replace(/\n$/, '');
	// The harness sends `e.stack`, which is mostly SDK frames. Keep the message the model can act on.
	if (!response.ok) {
		const message = text.split('\n').slice(0, 3).join('\n').trim();
		throw new Error(message || `The harness returned HTTP ${response.status}.`);
	}
	return text;
}

/** Harness output goes to the model and to ctrl+o; huge results get clipped with a note. */
function clip(text) {
	if (text.length <= MAX_OUTPUT) return text;
	const dropped = text.length - MAX_OUTPUT;
	return `${text.slice(0, MAX_OUTPUT)}\n\n... clipped ${dropped} more characters. Query less at a time.`;
}

const SNAPSHOTS = '.toolcode-browser';

async function writeSnapshot(base64, target, cwd, format) {
	const dir = path.dirname(target);
	if (!existsSync(dir)) await mkdir(dir, {recursive: true});
	const buffer = Buffer.from(base64, 'base64');
	await writeFile(target, buffer);
	// Relative to the workspace, not process.cwd(), so the path reads the same wherever the CLI was started.
	return {path: path.relative(cwd, target).split(path.sep).join('/'), bytes: buffer.length, format};
}

export default {
	name: 'browser-harness',
	tools: [
		{
			name: 'browser_status',
			label: 'Browser',
			description:
				'Check the browser harness: whether its server is up, whether a CDP session is connected, ' +
				'which Chromium browsers on this machine have remote debugging enabled, and the active tab. ' +
				'Call this first when browser work fails, and read it before connecting so you pick the right browser.',
			readOnly: true, // pure observation, so it also works in plan mode
			async run(_args, ctx) {
				let current = await health();
				if (!current) {
					if (!(await startServer())) {
						return {
							content:
								`The browser harness server is down on ${BASE} and could not be started.\n` +
								'Start it with: npx skills add https://github.com/browser-use/browser-harness-js --skill cdp\n' +
								'then: browser-harness-js --start',
							summary: 'Harness down',
							error: true,
						};
					}
					current = (await health()) ?? {};
				}
				// The harness renders [] and {} as an empty body, so an empty list arrives as ''.
				const browsers = await evalSnippet('return await detectBrowsers()', ctx).catch(e => `unavailable: ${e.message}`);
				const lines = [
					`server: ${BASE} (up, uptime ${current.uptime ?? 0}s)`,
					`connected: ${current.connected ?? false}`,
					`active tab: ${current.sessionId ?? 'none selected'}`,
					'',
					'browsers with remote debugging (most recent first):',
					!browsers || browsers === '[]' ? '  (none detected — the user has to enable it in chrome://inspect and click Allow)' : browsers,
					'',
					current.connected
						? 'Already connected. Use browser_tabs, then browser_eval with session.use(targetId).'
						: 'Not connected yet. Connect with browser_eval: `await session.connect()` to auto-detect, or pass {profileDir} / {wsUrl} to target a specific browser. There is no {port} option.',
				];
				return {content: lines.join('\n'), summary: current.connected ? 'Connected' : 'Server up, not connected'};
			},
		},
		{
			name: 'browser_tabs',
			label: 'Tabs',
			description:
				'List the open page tabs in the connected browser, numbered from 1, with each title, URL and ' +
				'targetId. Chrome internal pages are already filtered out. Note that CDP order is not the visual ' +
				'tab-strip order, so confirm with a title or screenshot before acting on "the first tab".',
			readOnly: true,
			async run(_args, ctx) {
				const raw = await evalSnippet('return await listPageTargets()', ctx);
				if (!raw) return {content: 'No open tabs. Open one in the browser, or create one with Target.createTarget.', summary: 'No tabs'};
				const targets = JSON.parse(raw);
				if (!targets.length) return {content: 'No open tabs.', summary: 'No tabs'};
				const rows = targets.map((t, i) => `${i + 1}. ${t.title || '(untitled)'}\n   ${t.url}\n   targetId: ${t.targetId}`);
				return {
					content: rows.join('\n'),
					summary: `${targets.length} tab${targets.length === 1 ? '' : 's'}`,
					output: raw,
				};
			},
		},
		{
			name: 'browser_eval',
			label: 'CDP',
			description: [
				'Run JavaScript in the browser harness, which holds one persistent CDP session shared by every call.',
				'Nothing is imported: `session` is already there with all 56 CDP domains mounted, so every method is',
				'available as `await session.<Domain>.<method>({...})` — for example `await session.Page.navigate({url})`',
				'or `await session.Input.dispatchMouseEvent({type:"mousePressed", x, y, button:"left", clickCount:1})`.',
				'Also preloaded: listPageTargets(), detectBrowsers(), resolveWsUrl({wsUrl|profileDir}), CDP.',
				'One statement: no semicolon and no newline needed, the value comes back automatically. Several',
				'statements: end with an explicit `return` or nothing is returned. `let`/`const` do not survive between',
				'calls, so stash values on `globalThis`. Connect once with `await session.connect()`, then pick a tab with',
				'`await session.use(targetId)` from browser_tabs — page-level calls then route to that tab automatically.',
				'To target a specific browser, connect() takes `{profileDir}` (reads its DevToolsActivePort) or `{wsUrl}`.',
				'There is NO `{port}` option despite what the upstream docs say: a bare `connect({port: 9222})` silently',
				'falls back to auto-detect. To use a known debug port, read the real URL first —',
				'`await session.connect({wsUrl: (await (await fetch("http://127.0.0.1:9333/json/version")).json()).webSocketDebuggerUrl})`.',
				'There are no click/goto/upload helpers by design; write the CDP call. For mechanics that are not obvious',
				`from the method list, ${CDN_DOCS} has per-topic recipes.`,
			].join(' '),
			parameters: {
				type: 'object',
				properties: {code: {type: 'string', description: 'JavaScript to run in the harness session.'}},
				required: ['code'],
			},
			// Deliberately not read-only: arbitrary JS can navigate, click, or submit forms.
			async run({code}, ctx) {
				const text = await evalSnippet(code, ctx);
				const clipped = clip(text);
				return {
					content: clipped || '(no result — the snippet did not return anything)',
					summary: text ? text.split('\n')[0].slice(0, 60) : 'No result',
					output: clipped,
				};
			},
		},
		{
			name: 'browser_screenshot',
			label: 'Shot',
			description:
				'Save a PNG/JPEG/WebP screenshot of the active tab into the workspace and report the path, so the ' +
				'user can look at what you see. Use it to confirm a page rendered, to identify a tab, or to show the ' +
				'result of a task. Writes a new file per call into .toolcode-browser/ unless you name a path.',
			parameters: {
				type: 'object',
				properties: {
					path: {type: 'string', description: 'Where to save it, relative to the workspace. Defaults to .toolcode-browser/shot-<n>.png.'},
					format: {type: 'string', enum: ['png', 'jpeg', 'webp'], description: 'Image format. Defaults to png.'},
					quality: {type: 'number', description: 'Compression quality 0-100. Only for jpeg and webp.'},
					fullPage: {type: 'boolean', description: 'Capture the whole scrollable page, not just the viewport.'},
				},
			},
			// Not read-only: it writes a file into the workspace.
			async run({path: target, format = 'png', quality, fullPage}, ctx) {
				const params = {format, captureBeyondViewport: Boolean(fullPage)};
				if (quality !== undefined && format !== 'png') params.quality = quality;
				const raw = await evalSnippet(`return (await session.Page.captureScreenshot(${JSON.stringify(params)})).data`, ctx);
				if (!raw) throw new Error('The browser returned no image data. Is a tab selected? Try await session.use(targetId) first.');

				const extension = format === 'jpeg' ? 'jpg' : format;
				const name = target || path.join(SNAPSHOTS, `shot-${Date.now()}.${extension}`);
				const file = ctx.resolvePath(name.endsWith(`.${extension}`) ? name : `${name}.${extension}`);
				const saved = await writeSnapshot(raw, file, ctx.cwd, extension);
				return {
					content: `Saved ${saved.format.toUpperCase()} screenshot: ${saved.path} (${saved.bytes} bytes).` +
						(fullPage ? ' Covers the full page.' : ' Viewport only — pass fullPage:true for the whole page.'),
					summary: `Shot ${saved.path}`,
				};
			},
			describe: args => args.path || 'screenshot',
		},
	],
	commands: [
		{
			name: 'browser',
			description: 'Run a CDP snippet in the browser harness: /browser <javascript>',
			args: '<javascript>',
			async run(args) {
				if (!args || !args.trim()) return 'Usage: /browser await session.Page.navigate({url: "https://example.com"})';
				try {
					return clip(await evalSnippet(args.trim(), {})) || '(no result)';
				} catch (error) {
					return `Error: ${error.message}`;
				}
			},
		},
	],
};
