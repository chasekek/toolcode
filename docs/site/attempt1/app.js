/* TOOLCODE plugin docs — app logic.
   The highlighter below is a port of src/ui/highlight.ts so code blocks are
   coloured exactly the way the TUI colours them. */

(() => {
	'use strict';

	const SECTIONS = window.SECTIONS;
	const $ = sel => document.querySelector(sel);
	const $$ = sel => Array.from(document.querySelectorAll(sel));
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/* ══════════════════  Highlighter (port of highlight.ts)  ══════════════════ */

	const JS_WORDS = new Set(
		('const let var function return if else for while do switch case break continue new class ' +
			'extends import from export default async await try catch finally throw typeof instanceof in ' +
			'of this super null undefined true false interface type enum implements public private protected ' +
			'readonly static void yield as keyof declare namespace satisfies')
			.split(/\s+/),
	);
	const JSON_WORDS = new Set(['true', 'false', 'null']);
	const SH_WORDS = new Set(
		'if then else elif fi for do done while until case esac function in export local return readonly set unset source'.split(
			/\s+/,
		),
	);

	const C_TOKENS =
		/(\/\/.*$)|(\/\*.*?(?:\*\/|$))|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b|\b0x[\da-f]+\b)|([A-Za-z_$][\w$]*)|(\s+|.)/gi;
	const HASH_TOKENS =
		/(#.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\b\d[\d_]*(?:\.\d+)?\b)|(\$?[A-Za-z_][\w-]*)|(\s+|.)/gi;

	const FAMILY = {js: 'c', mjs: 'c', ts: 'c', json: 'c', console: 'hash'};

	function escapeHtml(s) {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function wordKind(word, lang, line, end) {
		const keywords = lang === 'json' ? JSON_WORDS : lang === 'console' ? SH_WORDS : JS_WORDS;
		if (keywords.has(word)) return 'keyword';
		if (/^[A-Z][A-Za-z0-9_]*$/.test(word) && word.length > 1) return 'type';
		if (line[end] === '(') return 'call';
		return 'plain';
	}

	/** Splits one line into coloured spans; `state` carries block comments across lines. */
	function highlightLine(line, lang, state) {
		const family = FAMILY[lang];
		if (!family) return escapeHtml(line);

		const tokens = [];
		let rest = line;

		if (state.inBlockComment) {
			const end = rest.indexOf('*/');
			if (end === -1) return escapeHtml(line);
			tokens.push({text: rest.slice(0, end + 2), kind: 'comment'});
			rest = rest.slice(end + 2);
			state.inBlockComment = false;
		}

		const pattern = family === 'c' ? C_TOKENS : HASH_TOKENS;
		pattern.lastIndex = 0;
		for (const match of rest.matchAll(pattern)) {
			const text = match[0];
			if (!text) continue;
			const at = match.index ?? 0;
			let kind = 'plain';
			if (family === 'c') {
				const [, lineComment, blockComment, str, num, word] = match;
				if (lineComment) kind = 'comment';
				else if (blockComment) {
					kind = 'comment';
					if (!blockComment.endsWith('*/') || blockComment.length < 4) state.inBlockComment = true;
				} else if (str) kind = 'string';
				else if (num) kind = 'number';
				else if (word) kind = wordKind(word, lang, rest, at + text.length);
			} else {
				const [, comment, str, num, word] = match;
				if (comment) kind = 'comment';
				else if (str) kind = 'string';
				else if (num) kind = 'number';
				else if (word) kind = wordKind(word, lang, rest, at + text.length);
			}
			const last = tokens[tokens.length - 1];
			if (last && last.kind === kind) last.text += text;
			else tokens.push({text, kind});
		}
		return tokens
			.map(t => (t.kind === 'plain' ? escapeHtml(t.text) : `<span class="t-${t.kind}">${escapeHtml(t.text)}</span>`))
			.join('');
	}

	/** Whole-file highlight; identical output to rendering line by line. */
	function highlight(code, lang) {
		const state = {inBlockComment: false};
		return code.split('\n').map(l => highlightLine(l, lang, state)).join('\n');
	}

	/** Highlights every code block under `root` and wires its copy button. */
	function decorate(root) {
		root.querySelectorAll('pre code[class*="language-"]').forEach(code => {
			if (code.dataset.done) return;
			code.dataset.done = '1';
			const lang = code.className.replace('language-', '');
			code.innerHTML = highlight(code.textContent, lang);
		});
		root.querySelectorAll('.code__copy').forEach(btn => {
			btn.addEventListener('click', () => {
				const code = btn.closest('.code').querySelector('code');
				copy(code.textContent);
				btn.textContent = 'copied';
				btn.classList.add('is-done');
				setTimeout(() => {
					btn.textContent = 'copy';
					btn.classList.remove('is-done');
				}, 1400);
			});
		});
	}

	function copy(text) {
		if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
		else fallbackCopy(text);
	}

	function fallbackCopy(text) {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.select();
		try {
			document.execCommand('copy');
		} finally {
			ta.remove();
		}
	}

	/* ══════════════════  Shell: nav, routing, keys  ══════════════════ */

	const elDoc = $('#doc');
	const elContents = $('#contents');
	const elTitle = $('#mainTitle');
	const elFoot = $('#docFoot');
	const elKeybar = $('#keybar');
	const elPrompt = $('#prompt');
	const elPromptMenu = $('#promptMenu');
	const panelSide = $('.panel--side');
	const panelMain = $('.panel--main');

	let active = 0;
	let sideSel = 0;
	let focus = 'main';

	/* ── contents ── */
	function renderContents() {
		elContents.innerHTML =
			'<div class="nav">' +
			SECTIONS.map((s, i) => {
				const sel = i === active ? ' is-selected' : '';
				return `<button class="nav__row${sel}" type="button" data-i="${i}">
					<span class="nav__mark">▌</span>
					<span class="nav__icon">${s.icon}</span>
					<span class="nav__name">${s.title}</span>
					<span class="nav__key">${i + 1}</span>
				</button>`;
			}).join('') +
			'</div>';
		$('#contentsCount').textContent = `${SECTIONS.length} sections`;
	}

	function syncSelection() {
		$$('.nav__row').forEach((row, i) => {
			row.classList.toggle('is-selected', i === active);
			if (i === active) row.scrollIntoView({block: 'nearest'});
		});
	}

	function go(index, {scroll = true} = {}) {
		active = Math.max(0, Math.min(SECTIONS.length - 1, index));
		sideSel = active;
		const s = SECTIONS[active];
		elTitle.innerHTML = s.title;
		elDoc.innerHTML = s.html;
		elFoot.textContent = `${s.id} · ${active + 1} of ${SECTIONS.length}`;
		decorate(elDoc);
		if (scroll) elDoc.scrollTop = 0;
		renderContents();
		syncSelection();
		updateFocus();
		if (s.id === 'lab') setupLab();
		if (s.id === 'vibe') setupRoll();
	}

	function goToId(id) {
		const i = SECTIONS.findIndex(s => s.id === id);
		if (i >= 0) {
			go(i);
			setFocus('main');
		}
	}

	/* ── focus ── */
	function setFocus(which) {
		focus = which;
		if (which === 'prompt') elPrompt.focus();
		else if (document.activeElement === elPrompt) elPrompt.blur();
		updateFocus();
	}

	function updateFocus() {
		panelSide.classList.toggle('is-active', focus === 'side');
		panelMain.classList.toggle('is-active', focus === 'main');
		const hints =
			focus === 'side'
				? [['j/k', 'select'], ['↑↓', 'move'], ['1-9', 'jump'], ['tab', 'next panel'], ['esc', 'prompt']]
				: focus === 'prompt'
					? [['↑↓', 'move'], ['⏎', 'open'], ['esc', 'cancel']]
					: [['j/k', 'scroll'], ['g/G', 'top/bottom'], ['tab', 'next panel'], ['1-9', 'jump'], ['esc', 'prompt']];
		elKeybar.innerHTML =
			`<span class="keybar__hints">${hints
				.map(([k, a], i) => `${i ? '<span class="sep">·</span>' : ''}<b>${k}</b> ${a}`)
				.join('')}</span><span class="keybar__right">v0.0.2</span>`;
	}

	/* ── scrolling ── */
	function scrollBy(delta) {
		if (focus === 'side') {
			const next = Math.max(0, Math.min(SECTIONS.length - 1, sideSel + delta));
			if (next !== sideSel) go(next);
			return;
		}
		elDoc.scrollBy({top: delta * 72, behavior: reducedMotion ? 'auto' : 'smooth'});
	}

	document.addEventListener('keydown', e => {
		const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
		if (e.key === 'Escape') {
			if (document.activeElement === elPrompt) setFocus('main');
			else setFocus('prompt');
			e.preventDefault();
			return;
		}
		if (typing) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;

		if (e.key === '/') {
			e.preventDefault();
			setFocus('prompt');
			return;
		}
		if (e.key >= '1' && e.key <= '9') {
			const i = Number(e.key) - 1;
			if (i < SECTIONS.length) go(i);
			e.preventDefault();
			return;
		}
		if (e.key === 'Tab') {
			e.preventDefault();
			setFocus(focus === 'side' ? 'main' : focus === 'main' ? 'prompt' : 'side');
			return;
		}
		if (e.key === 'j' || e.key === 'ArrowDown') {
			e.preventDefault();
			scrollBy(1);
			return;
		}
		if (e.key === 'k' || e.key === 'ArrowUp') {
			e.preventDefault();
			scrollBy(-1);
			return;
		}
		if (e.key === 'PageDown') {
			e.preventDefault();
			elDoc.scrollBy({top: elDoc.clientHeight * 0.9});
			return;
		}
		if (e.key === 'PageUp') {
			e.preventDefault();
			elDoc.scrollBy({top: -elDoc.clientHeight * 0.9});
			return;
		}
		if (e.key === 'g' || e.key === 'G') {
			elDoc.scrollTo({top: e.key === 'g' ? 0 : elDoc.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth'});
			e.preventDefault();
		}
	});

	elContents.addEventListener('click', e => {
		const row = e.target.closest('.nav__row');
		if (!row) return;
		setFocus('side');
		go(Number(row.dataset.i));
	});
	panelSide.addEventListener('click', e => {
		if (!e.target.closest('.nav__row')) setFocus('side');
	});
	panelMain.addEventListener('click', () => setFocus('main'));
	document.addEventListener('click', e => {
		const goto = e.target.closest('[data-goto]');
		if (goto) goToId(goto.dataset.goto);
	});

	/* ── prompt filter ── */
	let menuIdx = 0;
	let matches = [];

	/** Ranked full-text search: a title hit beats a blurb hit beats a body hit. */
	function computeMatches(query) {
		const q = query.trim().toLowerCase();
		if (!q) return SECTIONS.map((_, i) => i);
		const scored = [];
		SECTIONS.forEach((s, i) => {
			const title = s.title.toLowerCase();
			const blurb = s.blurb.toLowerCase();
			let score = 0;
			if (title.startsWith(q)) score = 100;
			else if (title.includes(q)) score = 80;
			else if (blurb.includes(q)) score = 60;
			else if (s.html.toLowerCase().includes(q)) score = 20;
			if (score) scored.push({i, score});
		});
		return scored.sort((a, b) => b.score - a.score || a.i - b.i).map(({i}) => i);
	}

	function renderMenu() {
		if (!matches.length) {
			elPromptMenu.hidden = true;
			elPromptMenu.innerHTML = '';
			return;
		}
		elPromptMenu.hidden = false;
		elPromptMenu.innerHTML = matches
			.map((i, n) => {
				const s = SECTIONS[i];
				const on = n === menuIdx ? ' is-active' : '';
				return `<button class="prompt__opt${on}" type="button" data-i="${i}">
					<span>${s.icon}</span><span>${s.title}</span><em>${s.blurb}</em>
				</button>`;
			})
			.join('');
	}

	elPrompt.addEventListener('input', () => {
		matches = computeMatches(elPrompt.value);
		menuIdx = 0;
		renderMenu();
	});
	elPrompt.addEventListener('focus', () => {
		matches = computeMatches(elPrompt.value);
		menuIdx = 0;
		renderMenu();
		setFocus('prompt');
	});
	elPrompt.addEventListener('blur', () => {
		setTimeout(() => {
			elPromptMenu.hidden = true;
		}, 120);
	});
	elPrompt.addEventListener('keydown', e => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!matches.length) return;
			menuIdx = (menuIdx + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
			renderMenu();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			const target = matches[menuIdx];
			if (target !== undefined) {
				elPrompt.value = '';
				elPromptMenu.hidden = true;
				matches = [];
				go(target);
				setFocus('main');
			}
			return;
		}
		if (e.key === 'Tab') {
			e.preventDefault();
			const target = matches[menuIdx];
			if (target !== undefined) {
				elPrompt.value = SECTIONS[target].title;
				matches = computeMatches(elPrompt.value);
				menuIdx = 0;
				renderMenu();
			}
		}
	});
	elPromptMenu.addEventListener('click', e => {
		const opt = e.target.closest('.prompt__opt');
		if (!opt) return;
		elPrompt.value = '';
		elPromptMenu.hidden = true;
		matches = [];
		go(Number(opt.dataset.i));
		setFocus('main');
	});

	/* ══════════════════  Code output  ══════════════════ */

	/** Renders a code block and streams it in, the way deltas arrive in the TUI. */
	function revealCode(container, name, lang, code) {
		container.innerHTML = `<div class="code">
			<div class="code__bar"><span class="code__name">${escapeHtml(name)}</span><span class="code__tag">${lang}</span><button class="code__copy" type="button">copy</button></div>
			<pre><code class="language-${lang}"></code></pre>
		</div>`;
		const codeEl = container.querySelector('code');
		const state = {inBlockComment: false};
		const lines = code.replace(/\n$/, '').split('\n');
		decorate(container);

		if (reducedMotion) {
			codeEl.innerHTML = lines.map(l => highlightLine(l, lang, state)).join('\n');
			return;
		}
		let i = 0;
		const tick = () => {
			if (i >= lines.length) return;
			const html = highlightLine(lines[i], lang, state);
			if (i === 0) codeEl.innerHTML = html;
			else codeEl.innerHTML += '\n' + html;
			codeEl.scrollIntoView({block: 'nearest'});
			i += 1;
			setTimeout(tick, lines.length > 60 ? 2 : 12);
		};
		tick();
	}

	/** The mini TUI preview, drawn with the same glyphs the real panels use. */
	function previewMarkup({kind, icon, label, arg, result}) {
		const row = (cls, text) => `<div class="term-row ${cls}"><span class="mark">${cls.includes('sel') ? '▌' : ' '}</span>${text}</div>`;
		const toolPanel = `<div class="pt pt--focus"><span class="pt__title is-active">─[4]─Tools</span></div>`;
		const side =
			`<div class="pt pt--idle"><span class="pt__title">─[1]─Session</span></div>` +
			row('', `<span class="mut">◆ TOOLCODE</span>`) +
			row('', `<span class="mut">Todos</span>`) +
			row('', `<span class="mut">Files</span>`) +
			toolPanel +
			row('sel', `<span class="tool">${icon} ${escapeHtml(label)}</span>`);

		let main = '';
		if (kind === 'provider') {
			main =
				`<div class="term-row"><span class="lbl">❯</span> summarise the diff on this branch</div>` +
				`<div class="term-row"><span class="tool">${icon}</span> ${escapeHtml(label)}</div>` +
				`<div class="term-row"><span class="ok">✓</span> <span class="mut">streaming from</span> ${escapeHtml(result)}</div>`;
		} else {
			const verb = kind === 'command' ? '⏎' : '⠋';
			main =
				`<div class="term-row"><span class="lbl">❯</span> ${kind === 'command' ? `/${escapeHtml(label.replace(/\s+/g, ''))} ${escapeHtml(arg)}` : `use the ${escapeHtml(label)} tool on ${escapeHtml(arg)}`}</div>` +
				`<div class="term-row"><span class="tool">${icon}</span> ${escapeHtml(label)} <span class="mut">${escapeHtml(arg)}</span></div>` +
				`<div class="term-row"><span class="ok">${verb}</span> ${escapeHtml(result)}</div>`;
		}
		return `<div class="preview">
			<div class="preview__bar"><span>live preview</span><span class="ok">✓ what the user sees</span></div>
			<div class="preview__body"><div class="preview__side">${side}</div><div class="preview__main">${main}</div></div>
		</div>`;
	}

	/* ══════════════════  Plugin Lab  ══════════════════ */

	const LAB_ACTIONS = {
		tool: [
			{id: 'words', label: 'count words in a file', preset: ['word_count', 'Words', 'Count the words in a file in the workspace. Use when the user asks how long a file is.']},
			{id: 'lines', label: 'count non-blank lines', preset: ['code_lines', 'Lines', 'Count the non-blank lines in a file in the workspace. Use when the user asks how big a file is.']},
			{id: 'chars', label: 'count characters', preset: ['char_count', 'Chars', 'Count the characters in a file in the workspace.']},
			{id: 'shout', label: 'upper-case a string', preset: ['shout', 'Shout', 'Return the given text in upper case.']},
			{id: 'head', label: 'first N lines of a file', preset: ['first_lines', 'Head', 'Read the first lines of a file in the workspace, like head.']},
			{id: 'find', label: 'search a file for a pattern', preset: ['find_in_file', 'Find', 'Search a file in the workspace for a regular expression and report matching lines.']},
		],
		command: [
			{id: 'now', label: 'current time', preset: ['now', 'Time', 'now', 'Show the current time']},
			{id: 'root', label: 'workspace info', preset: ['where', 'Where', '', 'Show the workspace root and platform']},
			{id: 'files', label: 'count files by extension', preset: ['filestats', 'File stats', '', 'Count files in the workspace by extension']},
			{id: 'tree', label: 'list top-level entries', preset: ['top', 'Top level', '', 'List the top-level entries of the workspace']},
		],
	};

	let labKind = 'tool';

	function actionOptions() {
		return (LAB_ACTIONS[labKind] ?? [])
			.map(a => `<option value="${a.id}">${a.label}</option>`)
			.join('');
	}

	function labFields() {
		return {
			name: $('#f-name').value.trim(),
			label: $('#f-label').value.trim(),
			desc: $('#f-desc').value.trim(),
			args: $('#f-args').value.trim(),
			url: $('#f-url').value.trim(),
			env: $('#f-env').value.trim(),
			models: $('#f-models').value.trim(),
			ro: $('#f-ro').checked,
			action: $('#f-action').value,
		};
	}

	/* ── tool templates: each one is a complete, working plugin ── */
	const TOOL_TEMPLATES = {
		words: f => `import {readFile} from 'node:fs/promises';

export default {
	name: '${f.name}',
	tools: [
		{
			name: '${f.name}',
			label: '${f.label}',
			description: '${f.desc}',
			readOnly: ${f.ro},
			parameters: {
				type: 'object',
				properties: {
					path: {type: 'string', description: 'File to read, relative to the workspace root.'},
				},
				required: ['path'],
			},
			async run({path}, ctx) {
				const text = await readFile(ctx.resolvePath(path), 'utf8');
				const words = text.split(/\\s+/).filter(Boolean).length;
				return {
					content: \`\${path} has \${words} words.\`,
					summary: \`\${words} words\`,
				};
			},
		},
	],
};
`,
		lines: f => `import {readFile} from 'node:fs/promises';

export default {
	name: '${f.name}',
	tools: [
		{
			name: '${f.name}',
			label: '${f.label}',
			description: '${f.desc}',
			readOnly: ${f.ro},
			parameters: {
				type: 'object',
				properties: {
					path: {type: 'string', description: 'File to read, relative to the workspace root.'},
				},
				required: ['path'],
			},
			async run({path}, ctx) {
				const lines = (await readFile(ctx.resolvePath(path), 'utf8')).split('\\n');
				const filled = lines.filter(l => l.trim()).length;
				return {
					content: \`\${path}: \${filled} non-blank lines out of \${lines.length}.\`,
					summary: \`\${filled} lines\`,
				};
			},
		},
	],
};
`,
		chars: f => `import {readFile} from 'node:fs/promises';

export default {
	name: '${f.name}',
	tools: [
		{
			name: '${f.name}',
			label: '${f.label}',
			description: '${f.desc}',
			readOnly: ${f.ro},
			parameters: {
				type: 'object',
				properties: {
					path: {type: 'string', description: 'File to read, relative to the workspace root.'},
				},
				required: ['path'],
			},
			async run({path}, ctx) {
				const text = await readFile(ctx.resolvePath(path), 'utf8');
				return {
					content: \`\${path}: \${text.length} characters, \${text.split('\\n').length} lines.\`,
					summary: \`\${text.length} characters\`,
				};
			},
		},
	],
};
`,
		shout: f => `export default {
	name: '${f.name}',
	tools: [
		{
			name: '${f.name}',
			label: '${f.label}',
			description: '${f.desc}',
			readOnly: ${f.ro},
			parameters: {
				type: 'object',
				properties: {
					text: {type: 'string', description: 'Text to shout'},
				},
				required: ['text'],
			},
			run({text}) {
				return {
					content: text.toUpperCase(),
					summary: \`Shouted \${text.length} characters\`,
				};
			},
		},
	],
};
`,
		head: f => `import {readFile} from 'node:fs/promises';

export default {
	name: '${f.name}',
	tools: [
		{
			name: '${f.name}',
			label: '${f.label}',
			description: '${f.desc}',
			readOnly: ${f.ro},
			parameters: {
				type: 'object',
				properties: {
					path: {type: 'string', description: 'File to read, relative to the workspace root.'},
					lines: {type: 'number', description: 'How many lines to return. Defaults to 20.'},
				},
				required: ['path'],
			},
			async run({path, lines = 20}, ctx) {
				const text = await readFile(ctx.resolvePath(path), 'utf8');
				const head = text.split('\\n').slice(0, lines).join('\\n');
				return {
					content: head,
					summary: \`First \${Math.min(lines, text.split('\\n').length)} lines of \${path}\`,
					output: head,
				};
			},
		},
	],
};
`,
		find: f => `import {readFile} from 'node:fs/promises';

export default {
	name: '${f.name}',
	tools: [
		{
			name: '${f.name}',
			label: '${f.label}',
			description: '${f.desc}',
			readOnly: ${f.ro},
			parameters: {
				type: 'object',
				properties: {
					path: {type: 'string', description: 'File to search, relative to the workspace root.'},
					query: {type: 'string', description: 'Regular expression to look for.'},
				},
				required: ['path', 'query'],
			},
			async run({path, query}, ctx) {
				const re = new RegExp(query);
				const lines = (await readFile(ctx.resolvePath(path), 'utf8')).split('\\n');
				const hits = [];
				lines.forEach((line, i) => {
					if (re.test(line)) hits.push(\`\${i + 1}: \${line.trim()}\`);
				});
				return {
					content: hits.length ? hits.join('\\n') : 'No matches.',
					summary: hits.length ? \`Found \${hits.length} matches\` : 'No matches',
				};
			},
		},
	],
};
`,
	};

	const COMMAND_TEMPLATES = {
		now: f => `export default {
	name: '${f.name}',
	commands: [
		{
			name: '${f.name}',
			description: '${f.desc}',
			args: '${f.args || '[timezone]'}',
			run(args) {
				const zone = args.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
				try {
					const text = new Intl.DateTimeFormat('en-GB', {
						timeZone: zone,
						dateStyle: 'full',
						timeStyle: 'medium',
					}).format(new Date());
					return \`\${text}\\n(zone: \${zone})\`;
				} catch {
					return \`Unknown timezone "\${zone}". Try Europe/Berlin, America/New_York or UTC.\`;
				}
			},
		},
	],
};
`,
		root: f => `import {homedir, hostname, platform, release} from 'node:os';

export default {
	name: '${f.name}',
	commands: [
		{
			name: '${f.name}',
			description: '${f.desc}',
			run(args, ctx) {
				return [
					\`workspace  \${ctx.cwd}\`,
					\`home       \${homedir()}\`,
					\`host       \${hostname()}\`,
					\`platform   \${platform()} \${release()}\`,
					\`node       \${process.version}\`,
				].join('\\n');
			},
		},
	],
};
`,
		files: f => `import {readdir} from 'node:fs/promises';
import {extname, join} from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

export default {
	name: '${f.name}',
	commands: [
		{
			name: '${f.name}',
			description: '${f.desc}',
			async run(args, ctx) {
				const counts = new Map();
				let total = 0;
				async function walk(dir) {
					for (const entry of await readdir(dir, {withFileTypes: true})) {
						if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
						const full = join(dir, entry.name);
						if (entry.isDirectory()) {
							await walk(full);
							continue;
						}
						const ext = extname(entry.name) || '(none)';
						counts.set(ext, (counts.get(ext) ?? 0) + 1);
						total += 1;
					}
				}
				await walk(ctx.cwd);
				if (!total) return 'No files found.';
				const rows = [...counts.entries()]
					.sort((a, b) => b[1] - a[1])
					.map(([ext, n]) => \`\${ext.padEnd(10)} \${String(n).padStart(5)}\`);
				return \`\${total} files by extension:\\n\${rows.join('\\n')}\`;
			},
		},
	],
};
`,
		tree: f => `import {readdir} from 'node:fs/promises';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

export default {
	name: '${f.name}',
	commands: [
		{
			name: '${f.name}',
			description: '${f.desc}',
			async run(args, ctx) {
				const entries = await readdir(ctx.cwd, {withFileTypes: true});
				const rows = entries
					.filter(e => !SKIP.has(e.name) && !e.name.startsWith('.'))
					.map(e => (e.isDirectory() ? \`\${e.name}/\` : e.name))
					.sort();
				return rows.length ? rows.join('\\n') : '(empty workspace)';
			},
		},
	],
};
`,
	};

	function providerTemplate(f) {
		const models = (f.models || 'model')
			.split(',')
			.map(m => m.trim())
			.filter(Boolean)
			.map(m => `'${m}'`)
			.join(', ');
		return `export default {
	name: '${f.name}',
	providers: [
		{
			id: '${f.name.replace(/_/g, '-')}',
			name: '${f.label}',
			baseUrl: '${f.url}',
			apiKeyEnv: '${f.env}',
			models: [${models}],
		},
	],
};
`;
	}

	function generate() {
		const f = labFields();
		const out = $('#labOut');
		const status = $('#labStatus');
		let code, fileName, icon, label, arg, result, kind;

		if (labKind === 'tool') {
			code = TOOL_TEMPLATES[f.action](f);
			fileName = `tools/${f.name}.js`;
			icon = '⚒';
			label = f.label;
			arg = 'README.md';
			result = f.action === 'shout' ? 'THE README' : f.action === 'find' ? 'Found 12 matches' : '1,204';
			kind = 'tool';
		} else if (labKind === 'command') {
			code = COMMAND_TEMPLATES[f.action](f);
			fileName = `commands/${f.name}.js`;
			icon = '▸';
			label = f.label;
			arg = f.action === 'now' ? 'Europe/Berlin' : '';
			result = f.action === 'now' ? 'Tue 30 Sep 2026, 18:04:11' : f.action === 'root' ? 'workspace  ~/code' : '42 entries';
			kind = 'command';
		} else {
			code = providerTemplate(f);
			fileName = `providers/${f.name}.js`;
			icon = '⚡';
			label = f.label;
			result = (f.models || 'model').split(',')[0].trim();
			kind = 'provider';
		}

		status.innerHTML = '<span class="spinner">⠋</span> generating…';
		setTimeout(() => {
			out.innerHTML = '';
			const prev = document.createElement('div');
			out.appendChild(prev);
			revealCode(prev, fileName, 'js', code);
			const wrap = document.createElement('div');
			wrap.style.marginTop = '14px';
			wrap.innerHTML = previewMarkup({kind, icon, label, arg, result});
			out.appendChild(wrap);
			const save = document.createElement('div');
			save.className = 'note note--tip';
			save.innerHTML = `<div class="note__h"><span>✓</span>Save as</div><p><code>~/.toolcode/plugins/${fileName}</code>, then restart and run <code>/plugins</code>.</p>`;
			out.appendChild(save);
			status.innerHTML = `<span class="ok">✓</span> ${code.split('\n').length} lines`;
			decorate(out);
		}, 220);
	}

	function setupLab() {
		const tabs = $('#labTabs');
		const sel = $('#f-action');
		if (!tabs || !sel) return;
		if (!sel.options.length) sel.innerHTML = actionOptions();

		tabs.onclick = e => {
			const tab = e.target.closest('.tab');
			if (!tab) return;
			labKind = tab.dataset.kind;
			$$('.tab', tabs).forEach(t => t.classList.toggle('is-active', t === tab));
			$$('[data-only]', tabs.parentElement).forEach(node => {
				node.hidden = node.dataset.only !== labKind;
			});
			const behavior = $('[data-behavior]');
			behavior.hidden = labKind === 'provider';
			sel.innerHTML = actionOptions();
			if (labKind === 'provider') applyProviderPreset();
			else applyPreset(sel.value);
			$('#labOut').innerHTML = '';
			$('#labStatus').textContent = '';
		};

		if (!$('#labRun').dataset.wired) {
			$('#labRun').dataset.wired = '1';
			$('#labRun').addEventListener('click', generate);
			$('#labShuffle').addEventListener('click', () => {
				const options = LAB_ACTIONS[labKind];
				const pick = options[Math.floor(Math.random() * options.length)];
				$('#f-action').value = pick.id;
				applyPreset(pick.id);
				generate();
			});
			$('#f-action').addEventListener('change', () => applyPreset($('#f-action').value));
		}
	}

	/** Providers have no behaviour list, so they carry their own defaults. */
	function applyProviderPreset() {
		$('#f-name').value = 'local_llm';
		$('#f-label').value = 'Local LLM';
		$('#f-desc').value = 'An OpenAI-compatible server the model can run on.';
	}

	function applyPreset(id) {
		const action = LAB_ACTIONS[labKind].find(a => a.id === id);
		if (!action) return;
		const [name, label, desc, description] = action.preset;
		$('#f-name').value = name;
		$('#f-label').value = label;
		$('#f-desc').value = description || desc;
	}

	/* ══════════════════  Roll one by chance  ══════════════════ */

	const IDEAS = [
		{
			kind: 'tool', icon: '⚒', name: 'todo_scan', title: 'TODO scan',
			blurb: 'find unfinished work in the codebase',
			file: 'tools/todo-scan.js',
			code: `import {readdir, readFile} from 'node:fs/promises';
import {join, relative, extname} from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const CODE = new Set(['.js', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs']);
const MARKER = /\\b(TODO|FIXME|XXX|HACK)\\b/;

export default {
	name: 'todo-scan',
	tools: [
		{
			name: 'todo_scan',
			label: 'TODO',
			description: 'Find TODO, FIXME, XXX and HACK comments in source files. Use when the user asks what is unfinished or what was left behind.',
			readOnly: true,
			keywords: ['todo', 'unfinished', 'leftover', 'cleanup'],
			parameters: {
				type: 'object',
				properties: {
					dir: {type: 'string', description: 'Directory to scan, relative to the workspace root. Defaults to ".".'},
				},
			},
			async run({dir = '.'}, ctx) {
				const root = dir === '.' ? ctx.cwd : ctx.resolvePath(dir);
				const hits = [];
				async function walk(current) {
					for (const entry of await readdir(current, {withFileTypes: true})) {
						if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
						const full = join(current, entry.name);
						if (entry.isDirectory()) {
							await walk(full);
							continue;
						}
						if (!CODE.has(extname(entry.name))) continue;
						const lines = (await readFile(full, 'utf8')).split('\\n');
						lines.forEach((line, i) => {
							if (MARKER.test(line)) {
								hits.push(\`\${relative(ctx.cwd, full)}:\${i + 1}: \${line.trim()}\`);
							}
						});
					}
				}
				await walk(root);
				return {
					content: hits.length ? hits.join('\\n') : 'No TODO markers found.',
					summary: hits.length ? \`Found \${hits.length} markers\` : 'Nothing marked',
				};
			},
		},
	],
};
`,
		},
		{
			kind: 'tool', icon: '⚒', name: 'sloc', title: 'Lines of code',
			blurb: 'size of the project by file type',
			file: 'tools/sloc.js',
			code: `import {readdir, readFile} from 'node:fs/promises';
import {extname, join} from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const NOISE = /^\\s*(\\/\\/|\\/\\*|\\*|#)/;

export default {
	name: 'sloc',
	tools: [
		{
			name: 'count_code_lines',
			label: 'SLOC',
			description: 'Count lines of code in the workspace by file type, skipping blank lines and comments. Use when the user asks how big the project is.',
			readOnly: true,
			keywords: ['size', 'big', 'sloc', 'count'],
			parameters: {
				type: 'object',
				properties: {
					dir: {type: 'string', description: 'Directory to scan, relative to the workspace root. Defaults to ".".'},
				},
			},
			async run({dir = '.'}, ctx) {
				const root = dir === '.' ? ctx.cwd : ctx.resolvePath(dir);
				const counts = new Map();
				async function walk(current) {
					for (const entry of await readdir(current, {withFileTypes: true})) {
						if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
						const full = join(current, entry.name);
						if (entry.isDirectory()) {
							await walk(full);
							continue;
						}
						const lines = (await readFile(full, 'utf8')).split('\\n');
						const code = lines.filter(l => l.trim() && !NOISE.test(l)).length;
						const ext = extname(entry.name) || '(none)';
						counts.set(ext, (counts.get(ext) ?? 0) + code);
					}
				}
				await walk(root);
				if (!counts.size) return {content: 'No source files found.', summary: 'Nothing to count'};
				const total = [...counts.values()].reduce((a, b) => a + b, 0);
				const rows = [...counts.entries()]
					.sort((a, b) => b[1] - a[1])
					.map(([ext, n]) => \`\${ext.padEnd(8)} \${String(n).padStart(6)}\`);
				return {
					content: \`Lines of code by extension (total \${total}):\\n\${rows.join('\\n')}\`,
					summary: \`\${total} lines of code\`,
				};
			},
		},
	],
};
`,
		},
		{
			kind: 'tool', icon: '⚒', name: 'json_check', title: 'JSON check',
			blurb: 'validate and pretty-print JSON',
			file: 'tools/json-check.js',
			code: `import {readFile} from 'node:fs/promises';

export default {
	name: 'json-check',
	tools: [
		{
			name: 'json_check',
			label: 'JSON',
			description: 'Validate and pretty-print a JSON file in the workspace. Use when the user wants to check a JSON file or see it formatted.',
			readOnly: true,
			keywords: ['json', 'validate', 'format', 'pretty'],
			parameters: {
				type: 'object',
				properties: {
					path: {type: 'string', description: 'JSON file, relative to the workspace root.'},
				},
				required: ['path'],
			},
			async run({path}, ctx) {
				const text = await readFile(ctx.resolvePath(path), 'utf8');
				try {
					const pretty = JSON.stringify(JSON.parse(text), null, 2);
					return {
						content: \`\${path} is valid JSON.\\n\\n\${pretty.slice(0, 4000)}\`,
						summary: \`\${path} is valid\`,
						output: pretty,
					};
				} catch (error) {
					return {
						content: \`\${path} is not valid JSON: \${error.message}\`,
						summary: 'Invalid JSON',
						error: true,
					};
				}
			},
		},
	],
};
`,
		},
		{
			kind: 'tool', icon: '⚒', name: 'http_status', title: 'HTTP status',
			blurb: 'is this endpoint up?',
			file: 'tools/http-status.js',
			code: `export default {
	name: 'http-status',
	tools: [
		{
			name: 'http_status',
			label: 'HTTP',
			description: 'Check the status of a URL with a HEAD request. Use when the user asks whether a link, host or API endpoint is up.',
			readOnly: true,
			keywords: ['http', 'url', 'status', 'endpoint', 'up'],
			parameters: {
				type: 'object',
				properties: {
					url: {type: 'string', description: 'Absolute http(s) URL.'},
				},
				required: ['url'],
			},
			async run({url}, ctx) {
				const started = Date.now();
				try {
					const res = await fetch(url, {
						method: 'HEAD',
						redirect: 'follow',
						signal: ctx.signal,
					});
					const ms = Date.now() - started;
					return {
						content: \`\${url} → \${res.status} \${res.statusText} in \${ms}ms\`,
						summary: \`\${res.status} \${res.statusText}\`,
					};
				} catch (error) {
					return {
						content: \`\${url} failed: \${error.message}\`,
						summary: 'Request failed',
						error: true,
					};
				}
			},
		},
	],
};
`,
		},
		{
			kind: 'tool', icon: '⚒', name: 'env_names', title: 'Env names',
			blurb: 'which credentials exist, values hidden',
			file: 'tools/env-names.js',
			code: `export default {
	name: 'env-names',
	tools: [
		{
			name: 'env_names',
			label: 'Env',
			description: 'List the names of environment variables with values redacted. Use when the user asks which keys or configuration are available.',
			readOnly: true,
			keywords: ['env', 'environment', 'variables', 'keys'],
			parameters: {
				type: 'object',
				properties: {
					filter: {type: 'string', description: 'Only show names containing this text.'},
				},
			},
			describe: args => args.filter || 'all',
			run({filter = ''}) {
				const needle = filter.toLowerCase();
				const names = Object.keys(process.env)
					.filter(n => n.toLowerCase().includes(needle))
					.sort();
				if (!names.length) {
					return {content: 'No matching environment variables.', summary: 'None found'};
				}
				return {
					content: names.map(n => \`\${n}=<redacted>\`).join('\\n'),
					summary: \`\${names.length} variable\${names.length === 1 ? '' : 's'}\`,
				};
			},
		},
	],
};
`,
		},
		{
			kind: 'command', icon: '▸', name: 'deps', title: '/deps',
			blurb: 'direct dependencies of the workspace',
			file: 'commands/deps.js',
			code: `import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export default {
	name: 'deps',
	commands: [
		{
			name: 'deps',
			description: 'List the direct dependencies of the workspace package.json',
			args: '[filter]',
			async run(args, ctx) {
				const pkg = JSON.parse(await readFile(resolve(ctx.cwd, 'package.json'), 'utf8'));
				const all = {...pkg.dependencies, ...pkg.devDependencies};
				const names = Object.keys(all);
				const needle = args.trim().toLowerCase();
				if (needle) {
					const hits = names.filter(n => n.toLowerCase().includes(needle));
					return hits.length ? hits.join('\\n') : \`No dependency matches "\${needle}".\`;
				}
				const rows = names.map(n => \`\${n.padEnd(26)} \${all[n]}\`);
				return \`Direct dependencies (\${names.length}):\\n\${rows.join('\\n')}\`;
			},
		},
	],
};
`,
		},
		{
			kind: 'command', icon: '▸', name: 'time', title: '/time',
			blurb: 'the time anywhere on earth',
			file: 'commands/time.js',
			code: `export default {
	name: 'time',
	commands: [
		{
			name: 'time',
			description: 'Show the current time, here or in a named timezone',
			args: '[timezone]',
			run(args) {
				const zone = args.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
				try {
					const text = new Intl.DateTimeFormat('en-GB', {
						timeZone: zone,
						dateStyle: 'full',
						timeStyle: 'medium',
					}).format(new Date());
					return \`\${text}\\n(zone: \${zone})\`;
				} catch {
					return \`Unknown timezone "\${zone}". Try Europe/Berlin, America/New_York or UTC.\`;
				}
			},
		},
	],
};
`,
		},
		{
			kind: 'command', icon: '▸', name: 'git', title: '/git',
			blurb: 'branch, dirty count, last commit',
			file: 'commands/git.js',
			code: `import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec = promisify(execFile);

export default {
	name: 'git',
	commands: [
		{
			name: 'git',
			description: 'Show the current branch, changed file count and last commit',
			async run(args, ctx) {
				const git = (...parts) =>
					exec('git', parts, {cwd: ctx.cwd}).then(r => r.stdout.trim());
				try {
					const [branch, status, last] = await Promise.all([
						git('rev-parse', '--abbrev-ref', 'HEAD'),
						git('status', '--porcelain'),
						git('log', '-1', '--pretty=%h %s'),
					]);
					const changed = status ? status.split('\\n').length : 0;
					return [
						\`branch  \${branch}\`,
						\`dirty   \${changed ? \`\${changed} changed file\${changed === 1 ? '' : 's'}\` : 'clean'}\`,
						\`last    \${last}\`,
					].join('\\n');
				} catch {
					return 'Not a git repository, or git is not installed.';
				}
			},
		},
	],
};
`,
		},
		{
			kind: 'provider', icon: '⚡', name: 'together', title: 'Together AI',
			blurb: 'cheap hosted open models',
			file: 'providers/together.js',
			code: `export default {
	name: 'together',
	providers: [
		{
			id: 'together',
			name: 'Together AI',
			baseUrl: 'https://api.together.xyz/v1',
			apiKeyEnv: 'TOGETHER_API_KEY',
			models: [
				'Qwen/Qwen2.5-Coder-32B-Instruct',
				{id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo'},
			],
		},
	],
};
`,
		},
		{
			kind: 'provider', icon: '⚡', name: 'lmstudio', title: 'LM Studio',
			blurb: 'models on your own machine',
			file: 'providers/lmstudio.js',
			code: `export default {
	name: 'lmstudio',
	providers: [
		{
			id: 'lmstudio',
			name: 'LM Studio',
			// No apiKeyEnv: the local server needs no key.
			baseUrl: 'http://127.0.0.1:1234/v1',
			models: [
				{id: 'qwen2.5-coder-7b-instruct', label: 'Qwen2.5 Coder 7B (load it in LM Studio)'},
				{id: 'local-model', label: 'Whatever is loaded in LM Studio'},
			],
		},
	],
};
`,
		},
	];

	function setupRoll() {
		const cards = $('#cards');
		if (!cards) return;

		const deal = () => {
			const pool = IDEAS.slice();
			for (let i = pool.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[pool[i], pool[j]] = [pool[j], pool[i]];
			}
			cards.innerHTML = pool
				.slice(0, 5)
				.map(
					(idea, n) => `<button class="card" type="button" data-n="${n}">
						<span class="card__icon">${idea.icon}</span>
						<span class="card__text">${idea.title}</span>
						<span class="card__kind">${idea.kind}</span>
					</button>`,
				)
				.join('');
			cards._pool = pool.slice(0, 5);
			$$('.card', cards).forEach(btn => {
				btn.addEventListener('click', () => {
					$$('.card', cards).forEach(b => b.classList.remove('is-active'));
					btn.classList.add('is-active');
					const idea = cards._pool[Number(btn.dataset.n)];
					const out = $('#rollOut');
					revealCode(out, idea.file, 'js', idea.code);
					const why = document.createElement('div');
					why.className = 'note note--tip';
					why.innerHTML = `<div class="note__h"><span>✓</span>${idea.title}</div><p>${idea.blurb}. Save as <code>~/.toolcode/plugins/${idea.file}</code>, restart, and type <code>/plugins</code>.</p>`;
					out.appendChild(why);
					decorate(out);
					out.scrollIntoView({behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest'});
				});
			});
			$('#rollOut').innerHTML = '';
		};

		if (!cards.dataset.wired) {
			cards.dataset.wired = '1';
			deal();
			$('#rollBtn').addEventListener('click', deal);
			$('#rollShuffle').addEventListener('click', deal);
		}
	}

	/* ══════════════════  Boot  ══════════════════ */

	go(0);
})();