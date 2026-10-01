/* Documentation content. Markup only — app.js highlights code and wires the UI. */

const esc = s =>
	String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A code block. Inner backticks and ${ are escaped; backslashes are doubled. */
function block(name, lang, src) {
	return `<div class="code">
		<div class="code__bar"><span class="code__name">${esc(name)}</span><span class="code__tag">${lang}</span><button class="code__copy" type="button">copy</button></div>
		<pre><code class="language-${lang}">${esc(src)}</code></pre>
	</div>`;
}

function note(kind, glyph, head, body) {
	return `<div class="note note--${kind}"><div class="note__h"><span>${glyph}</span>${esc(head)}</div>${body}</div>`;
}

function table(head, rows) {
	return `<div class="table-wrap"><table>
		<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
		<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
	</table></div>`;
}

const NOTE_DANGER = note(
	'danger',
	'⚠',
	'Plugins run as your user',
	`<p>A plugin is ordinary code with your permissions. Only install plugins you trust. TOOLCODE deliberately never loads plugins from the project folder, so cloning a repository cannot run code on your machine.</p>`,
);
const NOTE_TIP = note(
	'tip',
	'✓',
	'Tip',
	`<p>Every example on this page is a working plugin. Nothing here is pseudocode.</p>`,
);

const SECTIONS = [
	/* ───────────────────────── 1. start ───────────────────────── */
	{
		id: 'start',
		title: 'Start here',
		icon: '◆',
		blurb: 'one file, three kinds of thing',
		html: `<div class="doc">
			<p class="lead">A plugin is <strong>one JavaScript file</strong>. It can add <strong>tools</strong> the model may call, <strong>providers</strong> the model may run on, and <strong>commands</strong> you type as slash commands. Nothing to install, nothing to import — drop the file in a folder, restart, done.</p>

			<h2>Anatomy</h2>
			<p>Every plugin has a single default export. Each of the three arrays is optional, but at least one must be present or the plugin is rejected.</p>
			${block('plugin.js', 'js', `export default {
	name: 'my-plugin',        // shown in /plugins; defaults to the file name
	tools: [],                // ⚒  things the model can do
	providers: [],            // ⚡  where the model runs
	commands: [],             // ▸  slash commands you type
};`)}

			<h2>Sixty seconds</h2>
			<ol class="steps">
				<li><p>Create the plugins folder. On Windows this is <code>C:\\Users\\&lt;you&gt;\\.toolcode\\plugins</code>.</p></li>
				<li><p>Save the plugin below as <code>shout.js</code> in that folder.</p></li>
				<li><p>Restart <code>toolcode</code> and type <code>/plugins</code> to confirm it loaded.</p></li>
			</ol>
			${block('shout.js', 'js', `export default {
	name: 'shout',
	tools: [
		{
			name: 'shout',
			label: 'Shout',
			description: 'Return the given text in upper case.',
			parameters: {
				type: 'object',
				properties: {text: {type: 'string', description: 'Text to shout'}},
				required: ['text'],
			},
			run({text}) {
				return text.toUpperCase();
			},
		},
	],
};`)}

			<h3>What you just typed</h3>
			<p>Nothing. Open the conversation and ask <em>“shout the README title in caps”</em> — the model reads the tool's <code>description</code>, decides it fits, calls it, and the result comes back into the conversation.</p>

			<h2>Three ways to load it</h2>
			${table(
				['Method', 'How', 'Good for'],
				[
					['Installed folder', `<code>~/.toolcode/plugins/</code> — a <code>.js</code> or <code>.mjs</code> file, or a folder with an <code>index.js</code>`, 'Plugins you keep'],
					['<code>--plugin</code> flag', `<code>toolcode --plugin path/to/plugin.js</code> — repeat the flag`, 'Trying something out'],
					['<code>TOOLCODE_PLUGIN_DIR</code>', 'Points the folder somewhere else entirely', 'Shared or per-project setups'],
					['<code>--no-plugins</code>', 'Skips the plugins folder entirely', 'Reproducing a clean run'],
				],
			)}
			<p>Use <code>TOOLCODE_PLUGIN_DIR</code> if <code>~/.toolcode/plugins</code> is awkward. It replaces the folder, it does not add to it.</p>

			<h2>How the folder is walked</h2>
			<p>Discovery is one level deep and forgiving:</p>
			<ul>
				<li>Loose <code>.js</code> and <code>.mjs</code> files load directly.</li>
				<li>A folder containing an <code>index.js</code> loads that file.</li>
				<li>A folder <em>without</em> one is a <strong>grouping folder</strong> — so you can sort into <code>tools/</code> and <code>providers/</code>.</li>
				<li>Anything starting with <code>.</code> or <code>_</code> is ignored, which is how <code>.jevjudge.json</code> stays out of the way.</li>
			</ul>
			<p>A plugin that throws while loading is skipped with a message at startup. It never stops the app, and it never half-registers: everything is validated before anything is added.</p>

			${NOTE_DANGER}
			${NOTE_TIP}

			<div class="next">
				<button class="btn" data-goto="tool">Next: tools →</button>
				<button class="btn" data-goto="lab">Skip to the lab</button>
			</div>
		</div>`,
	},

	/* ───────────────────────── 2. tool ───────────────────────── */
	{
		id: 'tool',
		title: 'Tools',
		icon: '⚒',
		blurb: 'things the model can do',
		html: `<div class="doc">
			<p class="lead">A tool is a function the model may call. Your job is to write a <code>description</code> good enough that the model picks your tool over the built-ins, a JSON Schema for the arguments, and a <code>run</code> that returns something useful.</p>

			<h2>The whole shape</h2>
			${block('tools/list-files.js', 'js', `import {readdir} from 'node:fs/promises';

export default {
	name: 'list-files',
	tools: [
		{
			name: 'list_files',              // letters, digits, _ and -; must be unique
			label: 'List',                   // shown in the UI; defaults to name
			description: 'List the files and folders in a directory of the workspace.',
			readOnly: true,                 // never changes anything → plan mode too
			parameters: {                   // JSON Schema for the arguments
				type: 'object',
				properties: {
					path: {type: 'string', description: 'Directory relative to the workspace root. Use "." for the root.'},
				},
				required: ['path'],
			},
			describe: args => args.path,     // one line next to the label in the UI
			async run({path}, ctx) {
				const dir = path === '.' ? ctx.cwd : ctx.resolvePath(path);
				const entries = await readdir(dir, {withFileTypes: true});
				const lines = entries.map(e => (e.isDirectory() ? \`\${e.name}/\` : e.name));
				return {
					content: lines.join('\\n') || '(empty directory)',
					summary: \`Listed \${lines.length} entries\`,
				};
			},
		},
	],
};`)}
			<p>That is the real bundled <code>list-files</code> plugin, verbatim. Copy it into <code>~/.toolcode/plugins/tools/</code> and it works.</p>

			<h2>Optional fields</h2>
			${table(
				['Field', 'Default', 'Purpose'],
				[
					['<code>label</code>', '<code>name</code>', 'Name shown in the UI, e.g. <code>Search</code>.'],
					['<code>readOnly</code>', '<code>false</code>', 'Set <code>true</code> if it never changes anything. <strong>Only read-only tools run in plan mode, <code>/improve</code> and <code>/judge</code>.</strong>'],
					['<code>keywords</code>', 'none', 'Words that point at the tool. A message using one is told the tool fits; the model still decides whether to call it.'],
					['<code>describe(args)</code>', 'first string argument', 'The text shown next to the label, e.g. a file path.'],
					['<code>parameters</code>', 'no arguments', 'A JSON Schema object.'],
				],
			)}

			<h3>keywords — getting picked up without being named</h3>
			<p>Plugins are invisible to a model that was never told about them. <code>keywords</code> are how a plugin joins the conversation: give a tool the keyword <code>judge</code> and a user typing <em>“judge whether this is correct”</em> makes the model aware of a tool that fits, even though the name never appears.</p>
			<p>For something more direct, typing <code>@tool_name</code> asks for a tool outright. Use it when you want to be certain rather than persuasive.</p>

			<h2>Returning a result</h2>
			<p>Return a <strong>string</strong> and you are done — the first line becomes the one-line summary and the whole string is both what the model sees and what <code>ctrl+o</code> shows.</p>
			<p>Return an <strong>object</strong> when you want to control those separately:</p>
			${table(
				['Field', 'Who sees it', 'Default'],
				[
					['<code>content</code>', 'The model', 'required'],
					['<code>summary</code>', 'The user, one line, e.g. <em>Found 3 matches</em>', 'first line of <code>content</code>, cut at 100 chars'],
					['<code>output</code>', 'The user, on <code>ctrl+o</code>', '<code>content</code>'],
					['<code>error: true</code>', 'Marks the call failed without throwing', '—'],
				],
			)}
			<p>Throwing an <code>Error</code> also reports a failure, and the model sees the message. That is usually what you want: the agent loop catches it and hands your text to the model, which then tries something else.</p>

			<h3>A tool that asks the user first</h3>
			<p><code>ctx.ask</code> opens a real popup in the TUI and resolves to one answer per question — or <code>null</code> if the user skipped. It is <strong>undefined outside the interactive TUI</strong>, so guard it:</p>
			${block('tools/confirm-delete.js', 'js', `import {rm} from 'node:fs/promises';

export default {
	name: 'confirm-delete',
	tools: [{
		name: 'delete_file_confirmed',
		description: 'Delete a file after the user confirms. Use only when asked explicitly.',
		parameters: {
			type: 'object',
			properties: {path: {type: 'string', description: 'File to delete, relative to the workspace.'}},
			required: ['path'],
		},
		async run({path}, ctx) {
			const target = ctx.resolvePath(path);
			if (ctx.ask) {
				const answers = await ctx.ask([{
					question: \`Delete \${path}?\`,
					options: ['No, keep it', 'Yes, delete it'],
				}]);
				const [answer] = answers ?? [];
				if (answer !== 'Yes, delete it') {
					return {content: 'The user declined. Nothing was deleted.', summary: 'Declined'};
				}
			}
			await rm(target, {force: true});
			return {content: \`Deleted \${path}\`, summary: \`Deleted \${path}\`};
		},
	}],
};`)}
			<p>Note what the declined branch returns: content the model can read, phrased so it stops rather than retries.</p>

			<div class="next">
				<button class="btn" data-goto="command">Next: commands →</button>
				<button class="btn" data-goto="ctx">Jump to the ctx reference</button>
			</div>
		</div>`,
	},

	/* ───────────────────────── 3. command ───────────────────────── */
	{
		id: 'command',
		title: 'Commands',
		icon: '▸',
		blurb: 'slash commands you type',
		html: `<div class="doc">
			<p class="lead">A command is what you type after a slash. It runs on your machine, <strong>the model never sees it</strong>, and whatever string it returns appears in the conversation as your reply.</p>

			${block('commands/hello-world.js', 'js', `export default {
	name: 'hello-world',
	commands: [
		{
			name: 'helloworld',        // typed as /helloworld
			description: 'Reply with hello world',
			run() {
				return 'hello world';
			},
		},
	],
};`)}

			<p>Type <code>/helloworld</code> and <code>hello world</code> shows up as your own message. It never reaches the provider.</p>

			<h2>Arguments</h2>
			<p><code>run</code> receives the raw text typed after the command, and a context carrying the workspace root:</p>
			${block('commands/wordcount.js', 'js', `import {readFile} from 'node:fs/promises';
import {resolve, relative} from 'node:path';

export default {
	name: 'wordcount',
	commands: [{
		name: 'words',
		description: 'Count the words in a workspace file',
		args: '[file]',                       // the hint shown in the / menu
		async run(args, ctx) {
			const file = args.trim() || 'README.md';
			const text = await readFile(resolve(ctx.cwd, file), 'utf8');
			const words = text.split(/\\s+/).filter(Boolean).length;
			return \`\${relative(ctx.cwd, resolve(ctx.cwd, file))}: \${words} words\`;
		},
	}],
};`)}

			<h2>Rules</h2>
			<ul>
				<li>Names are lowercased and typed as <code>/name</code>. Letters, digits and <code>-</code>, up to 32 characters.</li>
				<li>A command name cannot clash with a built-in or with another plugin's command.</li>
				<li><code>run</code> may be <code>async</code>. Returning a string shows it; returning nothing shows nothing.</li>
				<li>A leading slash is optional in the definition — <code>'/words'</code> and <code>'words'</code> are the same command.</li>
			</ul>

			${note(
				'info',
				'ℹ',
				'Commands are yours',
				`<p>This is the right place for anything the <em>user</em> wants to do rather than the model: shell out to git, switch configuration, dump a file. Because the model is never involved, a command can do anything your account can — and <code>console.log</code> from one shows up as a notice rather than on the screen, since TOOLCODE owns the terminal.</p>`,
			)}

			<div class="next">
				<button class="btn" data-goto="provider">Next: providers →</button>
				<button class="btn" data-goto="vibe">Or roll one at random</button>
			</div>
		</div>`,
	},

	/* ───────────────────────── 4. provider ───────────────────────── */
	{
		id: 'provider',
		title: 'Providers',
		icon: '⚡',
		blurb: 'where the model runs',
		html: `<div class="doc">
			<p class="lead">Most model APIs — OpenAI, Groq, Together, Mistral, DeepSeek, LM Studio, Ollama, vLLM — speak the OpenAI format. For those, a provider is six lines and no HTTP code at all.</p>

			${block('providers/groq.js', 'js', `export default {
	providers: [
		{
			id: 'groq',
			name: 'Groq',
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKeyEnv: 'GROQ_API_KEY',
			models: ['llama-3.3-70b-versatile', {id: 'qwen-qwq-32b', label: 'Qwen QwQ'}],
		},
	],
};`)}

			<h2>Fields</h2>
			${table(
				['Field', 'Purpose'],
				[
					['<code>id</code>', 'Unique. Used in <code>/model groq:llama-3.3-70b-versatile</code>. Letters, digits, <code>.</code>, <code>_</code>, <code>-</code>.'],
					['<code>models</code>', 'Ids as strings, or <code>{id, label}</code> for a friendlier name. At least one.'],
					['<code>name</code>', 'Display name. Defaults to the id.'],
					['<code>baseUrl</code>', 'Everything before <code>/chat/completions</code>. Trailing slashes are trimmed.'],
					['<code>apiKeyEnv</code>', 'Environment variable holding the key. Omit for local servers that need none.'],
					['<code>headers</code>', 'Extra HTTP headers added to every request.'],
				],
			)}
			<ul>
				<li>Models appear in <code>/model</code> immediately.</li>
				<li>A provider with an <code>apiKeyEnv</code> is listed in <code>/auth</code>, so users can paste a key instead of exporting a variable. Keys are stored per provider id in <code>~/.toolcode/auth.json</code>; the environment variable wins when both are set.</li>
				<li>The model needs <strong>tool calling</strong> to edit files.</li>
			</ul>

			<h2>Local models</h2>
			<p>The bundled <code>llamacpp.js</code> connects to a local <code>llama-server</code>. Tool calling needs the Jinja template enabled, which is what <code>--jinja</code> is for:</p>
			${block('console', 'console', `llama-server -m path/to/model.gguf --jinja -c 16384
toolcode --plugin plugins/providers/llamacpp.js`)}
			<p>Then pick <strong>llama.cpp</strong> in <code>/model</code>. It asks the server which model is loaded. Override the address with <code>LLAMACPP_URL</code> (default <code>http://127.0.0.1:8080</code>) and <code>LLAMACPP_API_KEY</code> if you started the server with <code>--api-key</code>. Use a tool-calling model such as Qwen2.5-Coder, Qwen3 or Llama 3.1+, with at least 16k of context.</p>

			<h2>APIs that are not OpenAI-compatible</h2>
			<p>Drop <code>baseUrl</code> and write <code>stream</code> instead. It is an async generator, so it streams by simply yielding:</p>
			${block('providers/echo-provider.js', 'js', `export default {
	name: 'echo',
	providers: [
		{
			id: 'echo',
			name: 'Echo',
			models: [{id: 'echo-1', label: 'Echo'}],
			async *stream({messages}) {
				// request = {model, apiKey, messages, tools, signal}
				const last = messages.at(-1);
				const text = last.role === 'user' ? \`You said: \${last.content}\` : 'Done.';
				for (const word of text.split(/(?<= )/)) {
					yield {type: 'text', delta: word};
				}
				// To call a tool instead:
				// yield {type: 'tool_call', call: {id: 'call_1', name: 'read_file', arguments: '{"path":"README.md"}'}};
			},
		},
	],
};`)}
			${table(
				['Event', 'Meaning'],
				[
					['<code>{type: \'text\', delta}</code>', 'A chunk of assistant text. Yield as often as you like; the UI batches it.'],
					['<code>{type: \'tool_call\', call}</code>', 'One <strong>finished</strong> call: <code>{id, name, arguments}</code> where arguments is a JSON string. Yield each call once.'],
				],
			)}
			<p>TOOLCODE runs the tools itself and calls <code>stream</code> again with the results appended. Honour <code>signal</code> — it aborts when the user presses <code>esc</code>.</p>

			<div class="next">
				<button class="btn" data-goto="lab">Next: build one →</button>
			</div>
		</div>`,
	},

	/* ───────────────────────── 5. lab ───────────────────────── */
	{
		id: 'lab',
		title: 'Plugin Lab',
		icon: '◈',
		blurb: 'fill in a form, get a file',
		html: `<div class="doc">
			<p class="lead">Fill in the form and the plugin writes itself. The code is real, complete, and pastes straight into <code>~/.toolcode/plugins/</code> — the field names are the exact contract the loader validates.</p>

			<div class="lab">
				<div class="lab__tabs" id="labTabs">
					<button class="tab is-active" type="button" data-kind="tool">⚒ tool</button>
					<button class="tab" type="button" data-kind="command">▸ command</button>
					<button class="tab" type="button" data-kind="provider">⚡ provider</button>
				</div>

				<div class="lab__grid">
					<label class="field"><span class="field__label">tool <b>name</b></span>
						<input type="text" id="f-name" value="word_count" spellcheck="false" autocomplete="off" /></label>
					<label class="field"><span class="field__label">ui <b>label</b></span>
						<input type="text" id="f-label" value="Words" spellcheck="false" autocomplete="off" /></label>
					<label class="field" style="grid-column:1/-1"><span class="field__label"><b>description</b> the model reads</span>
						<input type="text" id="f-desc" value="Count the words in a file in the workspace." spellcheck="false" autocomplete="off" /></label>
					<label class="field" data-behavior><span class="field__label"><b>behaviour</b> what run() does</span><select id="f-action"></select></label>
					<label class="field" data-only="command" hidden><span class="field__label">argument <b>hint</b></span>
						<input type="text" id="f-args" value="[file]" spellcheck="false" autocomplete="off" /></label>
					<label class="field" data-only="provider" hidden><span class="field__label"><b>baseUrl</b></span>
						<input type="url" id="f-url" value="http://127.0.0.1:11434/v1" spellcheck="false" autocomplete="off" /></label>
					<label class="field" data-only="provider" hidden><span class="field__label"><b>apiKeyEnv</b></span>
						<input type="text" id="f-env" value="OLLAMA_API_KEY" spellcheck="false" autocomplete="off" /></label>
					<label class="field" data-only="provider" hidden><span class="field__label"><b>models</b> comma separated</span>
						<input type="text" id="f-models" value="qwen2.5-coder:7b" spellcheck="false" autocomplete="off" /></label>
					<label class="check" data-only="tool"><input type="checkbox" id="f-ro" checked /><span>readOnly — safe in plan mode</span></label>
				</div>

				<div class="lab__actions">
					<button class="btn" type="button" id="labShuffle">⇄ surprise me</button>
					<button class="btn btn--primary" type="button" id="labRun">⏎ generate</button>
					<span class="lab__status" id="labStatus"></span>
				</div>
			</div>

			<div id="labOut"></div>

			<h2>Where it goes</h2>
			${block('console', 'console', `mkdir -p ~/.toolcode/plugins/tools      # Windows: mkdir $env:USERPROFILE\\.toolcode\\plugins\\tools
# save the generated file as ~/.toolcode/plugins/tools/<name>.js
toolcode                                     # restart and type /plugins

# or skip installing while you iterate:
toolcode --plugin ./<name>.js`)}
			<p>Iterating with <code>--plugin</code> beats restarting on the installed copy: the loader imports with a cache-busting query string, so an edited file is picked up on the next start without stale module state.</p>

			<div class="next">
				<button class="btn" data-goto="vibe">Next: roll one by chance →</button>
			</div>
		</div>`,
	},

	/* ───────────────────────── 6. vibe ───────────────────────── */
	{
		id: 'vibe',
		title: 'Roll one',
		icon: '⇄',
		blurb: 'vibe-code a plugin by chance',
		html: `<div class="doc">
			<p class="lead">You do not have to know what you want. Roll a hand, read what comes up, and keep it or reroll. Ten complete, working plugins are on the deck.</p>

			<div class="roll">
				<button class="btn btn--primary" type="button" id="rollBtn"><span class="dice">⚄</span> roll</button>
				<button class="btn" type="button" id="rollShuffle">⇄ reroll</button>
				<span class="roll__hint">Five cards per hand. Click one to load the plugin.</span>
			</div>
			<div class="cards" id="cards"></div>
			<div id="rollOut"></div>

			<h2>The real vibe-coding loop</h2>
			<p>The cards are for when you want a starting point. When you want something specific, the fastest loop is to let TOOLCODE write the plugin, in TOOLCODE:</p>
			<ol class="steps">
				<li><p>Open a scratch directory and run <code>toolcode --plugin ./scratch.js</code> so the plugin you are about to write can load immediately.</p></li>
				<li><p>Describe the tool in plain language. Be specific about the arguments and about what it should return.</p></li>
				<li><p>Ask it to write the file, then open it and run it. <code>/plugins</code> tells you what actually registered.</p></li>
			</ol>
			<p>A prompt that works:</p>
			${block('prompt', 'console', `Write a TOOLCODE plugin to ./scratch.js that counts the lines of
TypeScript in a file, ignoring blank lines and comments.

It must export default {name, tools:[{name, description, parameters, readOnly, run}]}.
Read paths with ctx.resolvePath, never fs directly on a user-supplied path.
Return {content, summary}. Throw an Error on failure so the model sees the message.
Set readOnly: true because it never writes anything.`)}
			<p>Then verify by asking the model to use it, watch <code>/plugins</code>, and move the file to <code>~/.toolcode/plugins/</code> once it does what you wanted.</p>

			${note(
				'warn',
				'⚠',
				'Keep the description honest',
				`<p>The description is the only thing the model reads before deciding to call your tool. “Counts lines” will not get called when the user says <em>“how big is this file”</em>. Say what the tool does <strong>and when to use it</strong> — that is the single highest-leverage line in the file.</p>`,
			)}

			<div class="next">
				<button class="btn" data-goto="ctx">Next: the full reference →</button>
			</div>
		</div>`,
	},

	/* ───────────────────────── 7. ctx ───────────────────────── */
	{
		id: 'ctx',
		title: 'Context &amp; API',
		icon: '⚙',
		blurb: 'the whole contract',
		html: `<div class="doc">
			<p class="lead">Everything the loader validates, in one place. These are the rules in <code>normalize.ts</code> — if something is rejected, it is because one of these did not hold.</p>

			<h2>The context object</h2>
			<p>Capabilities reach your plugin through <code>ctx</code>, never through an import. That is what makes a plugin testable and sandboxable.</p>
			${table(
				['Field', 'What it is'],
				[
					['<code>ctx.cwd</code>', 'The workspace root.'],
					['<code>ctx.resolvePath(p)</code>', 'Turns a relative path into an absolute one. <strong>Throws</strong> if the path escapes the workspace or targets the root itself.'],
					['<code>ctx.signal</code>', 'An <code>AbortSignal</code> that fires on <code>esc</code>. Pass it to <code>fetch</code> and other slow work.'],
					['<code>ctx.session.todos</code>', 'The current task list, <code>{id, text, status, deps}</code>. Resets on <code>/clear</code>.'],
					['<code>ctx.ask(questions)</code>', 'Asks the user. Resolves to one answer per question, or <code>null</code> if skipped. <strong>Undefined outside the interactive TUI</strong> — check first.'],
				],
			)}

			<h3>Always resolve paths through ctx</h3>
			<p><code>resolvePath</code> is the sandbox. A tool that passes a user- or model-supplied string straight to <code>fs</code> has no sandbox at all:</p>
			${block('tools/safe-read.js', 'js', `import {resolve} from 'node:path';

// good — rejects ../ escapes and absolute paths outside the workspace
export const safe = (path, ctx) => ctx.resolvePath(path);

// bad — the model can ask for ../../.ssh/id_rsa
export const unsafe = (path, ctx) => resolve(ctx.cwd, path);`)}
			<p>Commands do not get <code>resolvePath</code>, only <code>{cwd}</code> — they run as the user, on purpose.</p>

			<h3>Asking the user</h3>
			${table(
				['Question field', 'Purpose'],
				[
					['<code>question</code>', 'The prompt shown in the popup.'],
					['<code>options</code>', 'An array of choices the user picks from.'],
					['<code>header</code>', 'Optional short label above the question.'],
				],
			)}

			<h2>Tool field reference</h2>
			${table(
				['Field', 'Type', 'Required', 'Default'],
				[
					['<code>name</code>', 'string', '✓', '—'],
					['<code>description</code>', 'string', '✓', '—'],
					['<code>run</code>', '(args, ctx) =&gt; result', '✓', '—'],
					['<code>parameters</code>', 'object', '', "<code>{type:'object', properties:{}}</code>"],
					['<code>label</code>', 'string', '', '<code>name</code>'],
					['<code>readOnly</code>', 'boolean', '', '<code>false</code>'],
					['<code>keywords</code>', 'string[]', '', '<code>[]</code>'],
					['<code>describe</code>', '(args) =&gt; string', '', 'first string argument'],
				],
			)}

			<h2>Command field reference</h2>
			${table(
				['Field', 'Type', 'Required', 'Notes'],
				[
					['<code>name</code>', 'string', '✓', 'Letters, digits, <code>-</code>; up to 32 chars. A leading <code>/</code> is stripped.'],
					['<code>description</code>', 'string', '✓', 'Shown in <code>/help</code> and the slash menu.'],
					['<code>run</code>', '(args, ctx) =&gt; unknown', '✓', 'Return a string to show it. May be async.'],
					['<code>args</code>', 'string', '', 'Hint in the menu, e.g. <code>[file]</code>.'],
				],
			)}

			<h2>Provider field reference</h2>
			${table(
				['Field', 'Type', 'Required', 'Notes'],
				[
					['<code>id</code>', 'string', '✓', 'Letters, digits, <code>.</code>, <code>_</code>, <code>-</code>.'],
					['<code>models</code>', '(string | {id, label})[]', '✓', 'At least one; each needs an <code>id</code>.'],
					['<code>baseUrl</code>', 'string', '✓*', 'Wires up the OpenAI-compatible client automatically.'],
					['<code>stream</code>', 'async generator', '✓*', 'Required instead of <code>baseUrl</code> for other APIs.'],
					['<code>name</code>', 'string', '', 'Defaults to <code>id</code>.'],
					['<code>apiKeyEnv</code>', 'string', '', 'Omit for servers needing no key.'],
					['<code>headers</code>', 'Record&lt;string,string&gt;', '', 'Added to every request.'],
				],
			)}
			<p><small>One of <code>baseUrl</code> or <code>stream</code> is required; with neither, the provider is rejected.</small></p>

			<h2>TypeScript</h2>
			<p>Optional, and only for autocomplete — plugins are plain JavaScript and need no build step:</p>
			${block('plugin.ts', 'ts', `import {definePlugin} from 'toolcode/plugin';

export default definePlugin({
	tools: [{
		name: 'shout',
		description: 'Return the given text in upper case.',
		parameters: {type: 'object', properties: {text: {type: 'string'}}},
		run: ({text}) => text.toUpperCase(),
	}],
});`)}
			<p><code>export default</code> can also be a function, async if you like, which is handy for setup work such as fetching a model list at startup.</p>

			<div class="next">
				<button class="btn" data-goto="debug">Next: when it does not load →</button>
			</div>
		</div>`,
	},

	/* ───────────────────────── 8. debug ───────────────────────── */
	{
		id: 'debug',
		title: 'Debugging',
		icon: '✕',
		blurb: 'why it was skipped',
		html: `<div class="doc">
			<p class="lead">A plugin that throws while loading is skipped with the message at startup, and the app keeps running. These are the exact errors, and what causes each.</p>

			${table(
				['Message', 'Cause'],
				[
					['<em>Expected <code>export default {tools: [...], providers: [...], commands: [...]}</code>.</em>', 'No default export, or it is not an object.'],
					['<em>Plugin defines no tools, providers or commands.</em>', 'All three arrays were empty or missing.'],
					['<em>Tool <code>"x"</code> needs a description.</em>', 'The model cannot choose a tool it does not understand.'],
					['<em>Tool <code>"x"</code> needs a run(args, ctx) function.</em>', '<code>run</code> is missing or not a function.'],
					['<em>Tool name <code>"x"</code> must be 1-64 letters, digits, "_" or "-".</em>', 'Name too long, empty, or has other characters.'],
					['<em>Tool <code>"x"</code> keywords must be an array of non-empty strings.</em>', 'A keyword was not a string, or was blank.'],
					['<em>Tool <code>"x"</code> is already taken.</em>', 'A built-in — <code>read_file</code>, <code>write_file</code>, <code>delete_file</code>, <code>todo_write</code>, <code>ask</code> — or another plugin.'],
					['<em>Command <code>x</code> is already taken.</em>', 'A built-in command or another plugin.'],
					['<em>Provider <code>"x"</code> needs a baseUrl … or a stream function.</em>', 'Neither was given.'],
					['<em>Provider <code>"x"</code> has a model without an id.</em>', 'An entry in <code>models</code> has no <code>id</code>.'],
					['<em>Tool returned neither a string nor an object with a "content" string.</em>', '<code>run</code> returned something else — often nothing at all.'],
				],
			)}

			<h2>It loaded but the model ignores it</h2>
			<p>Almost always the description. Three fixes, in order of how often they are the answer:</p>
			<ol class="steps">
				<li><p><strong>Say when to use it, not only what it does.</strong> <code>“Count words”</code> loses to <code>read_file</code>. <code>“Count the words in a file when the user asks how long it is”</code> competes.</p></li>
				<li><p><strong>Add keywords.</strong> The words users actually type are the ones that make the model aware of the tool.</p></li>
				<li><p><strong>Ask for it outright.</strong> Typing <code>@word_count</code> proves the tool works and isolates the problem to discovery.</p></li>
			</ol>

			<h2>console.log goes somewhere odd</h2>
			<p>TOOLCODE owns the whole terminal and repaints every frame, so a stray <code>console.log</code> would corrupt the display. Instead, <code>console.log</code>, <code>console.warn</code> and <code>console.error</code> from a plugin are captured and shown as notices in the conversation. They will not appear on the screen, and they will not vanish.</p>

			<h2>Debugging loop</h2>
			${block('console', 'console', `# iterate against a file, no install
toolcode --plugin ./scratch.js

# confirm what actually registered
/plugins

# isolate the environment entirely
toolcode --no-plugins --plugin ./scratch.js`)}
			<p>If a tool misbehaves, remember the two layers are independent: your <code>run</code> throws, the agent loop catches it and hands the message to the model, which then tries something else. So a tool that throws with a useful message is not a failure — it is the agent learning.</p>

			<div class="next">
				<button class="btn" data-goto="ship">Next: publishing →</button>
			</div>
		</div>`,
	},

	/* ───────────────────────── 9. ship ───────────────────────── */
	{
		id: 'ship',
		title: 'Publishing',
		icon: '⚓',
		blurb: 'the marketplace',
		html: `<div class="doc">
			<p class="lead"><code>/marketplace</code> lists the catalog that ships inside the package. Installing copies a file into <code>~/.toolcode/plugins/</code> and loads it on the spot — no restart. Press enter again to uninstall.</p>

			<h2>The catalog entry</h2>
			${block('plugins/marketplace.json', 'json', `{"id": "my-plugin", "name": "My Plugin", "category": "tool", "description": "One line about it.", "file": "tools/my-plugin.js"}`)}
			${table(
				['Field', 'Meaning'],
				[
					['<code>id</code>', 'Becomes <code>~/.toolcode/plugins/&lt;id&gt;.mjs</code> on install.'],
					['<code>category</code>', '<code>tool</code>, <code>provider</code> or <code>command</code> — it filters the popup.'],
					['<code>file</code>', 'Path relative to the plugins directory.'],
					['<code>description</code>', 'One line shown under the cursor at the bottom of the popup.'],
				],
			)}
			<p>The popup is filterable: <code>tab</code> or the left/right arrows move between <strong>all</strong>, <strong>tool</strong>, <strong>provider</strong> and <strong>command</strong>, and <code>1</code>–<code>4</code> jump straight to one. <code>enter</code> installs or uninstalls, <code>esc</code> goes back.</p>

			<h2>Checklist before you publish</h2>
			<ul>
				<li>The <code>description</code> says when to use the tool, not just what it does.</li>
				<li>Paths go through <code>ctx.resolvePath</code>; nothing reaches outside the workspace.</li>
				<li><code>fetch</code> and other slow work take <code>ctx.signal</code>.</li>
				<li><code>ctx.ask</code> is guarded, because it is undefined outside the TUI.</li>
				<li><code>readOnly: true</code> if nothing changes — it then works in plan mode.</li>
				<li>No API keys in the file. The bundled judges read theirs from <code>~/.toolcode/plugins/</code> so they never land in a repository.</li>
				<li>It loads under <code>--no-plugins --plugin ./file.js</code> with no other plugin present.</li>
			</ul>

			${NOTE_DANGER}
			<div class="next">
				<button class="btn" data-goto="start">Back to the top</button>
				<button class="btn" data-goto="lab">Open the lab</button>
			</div>
		</div>`,
	},
];

window.SECTIONS = SECTIONS;