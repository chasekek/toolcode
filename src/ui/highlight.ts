/**
 * A deliberately small syntax highlighter: keywords, strings, numbers,
 * comments, types and calls for the languages a coding agent shows most.
 * It works line by line and only carries block-comment state across lines.
 */

export type TokenKind = 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'type' | 'call';

export interface Token {
	text: string;
	kind: TokenKind;
}

type Family = 'c' | 'hash' | 'plain';

interface Language {
	family: Family;
	keywords: Set<string>;
}

const words = (list: string) => new Set(list.split(/\s+/));

const JS = words(
	'const let var function return if else for while do switch case break continue new class extends import from export default async await try catch finally throw typeof instanceof in of this super null undefined true false interface type enum implements public private protected readonly static void yield as keyof declare namespace satisfies',
);
const PY = words(
	'def class return if elif else for while in not and or is None True False import from as with try except finally raise lambda yield pass break continue global nonlocal async await self match case',
);
const SH = words('if then else elif fi for do done while until case esac function in export local return readonly set unset source');
const C_LIKE = words(
	'int char float double void struct enum union return if else for while do switch case break continue const static public private protected class new true false null nil fn let mut pub use impl trait match func package import type var go defer interface extends implements throws try catch finally this self struct mod crate where async await',
);
const JSON_WORDS = words('true false null');

const LANGUAGES: Record<string, Language> = {};
for (const name of ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts', 'javascript', 'typescript']) LANGUAGES[name] = {family: 'c', keywords: JS};
for (const name of ['py', 'python']) LANGUAGES[name] = {family: 'hash', keywords: PY};
for (const name of ['sh', 'bash', 'zsh', 'shell', 'console', 'ps1', 'powershell']) LANGUAGES[name] = {family: 'hash', keywords: SH};
for (const name of ['go', 'rs', 'rust', 'java', 'kt', 'kotlin', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'csharp', 'swift', 'scala', 'dart']) LANGUAGES[name] = {family: 'c', keywords: C_LIKE};
for (const name of ['json', 'jsonc']) LANGUAGES[name] = {family: 'c', keywords: JSON_WORDS};
for (const name of ['yaml', 'yml', 'toml', 'ini', 'rb', 'ruby']) LANGUAGES[name] = {family: 'hash', keywords: words('true false null yes no nil def end class module if else elsif unless do')};

/** The language for a fence tag or a file name, or undefined for plain text. */
export function languageFor(tagOrPath: string | undefined): string | undefined {
	if (!tagOrPath) return undefined;
	const tag = tagOrPath.trim().toLowerCase();
	if (LANGUAGES[tag]) return tag;
	const ext = /\.([a-z0-9]+)$/.exec(tag)?.[1];
	return ext && LANGUAGES[ext] ? ext : undefined;
}

// Order matters: comments and strings before words, so keywords inside them stay plain.
const C_TOKENS = /(\/\/.*$)|(\/\*.*?(?:\*\/|$))|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b|\b0x[\da-f]+\b)|([A-Za-z_$][\w$]*)|(\s+|.)/gi;
const HASH_TOKENS = /(#.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\b\d[\d_]*(?:\.\d+)?\b)|(\$?[A-Za-z_][\w-]*)|(\s+|.)/gi;

export interface HighlightState {
	inBlockComment: boolean;
}

/** Splits one line into colored tokens; `state` carries /* comments *\/ between lines. */
export function highlightLine(line: string, lang: string | undefined, state: HighlightState = {inBlockComment: false}): Token[] {
	const language = lang ? LANGUAGES[lang] : undefined;
	if (!language || language.family === 'plain') return [{text: line, kind: 'plain'}];
	const tokens: Token[] = [];
	let rest = line;

	if (state.inBlockComment) {
		const end = rest.indexOf('*/');
		if (end === -1) return [{text: line, kind: 'comment'}];
		tokens.push({text: rest.slice(0, end + 2), kind: 'comment'});
		rest = rest.slice(end + 2);
		state.inBlockComment = false;
	}

	const pattern = language.family === 'c' ? C_TOKENS : HASH_TOKENS;
	pattern.lastIndex = 0;
	for (const match of rest.matchAll(pattern)) {
		const text = match[0];
		if (!text) continue;
		const at = match.index ?? 0;
		let kind: TokenKind = 'plain';
		if (language.family === 'c') {
			const [, lineComment, blockComment, string, number, word] = match;
			if (lineComment) kind = 'comment';
			else if (blockComment) {
				kind = 'comment';
				if (!blockComment.endsWith('*/') || blockComment.length < 4) state.inBlockComment = true;
			} else if (string) kind = 'string';
			else if (number) kind = 'number';
			else if (word) kind = wordKind(word, language, rest, at + text.length);
		} else {
			const [, comment, string, number, word] = match;
			if (comment) kind = 'comment';
			else if (string) kind = 'string';
			else if (number) kind = 'number';
			else if (word) kind = wordKind(word, language, rest, at + text.length);
		}
		const last = tokens.at(-1);
		if (last && last.kind === kind) last.text += text;
		else tokens.push({text, kind});
	}
	return tokens;
}

function wordKind(word: string, language: Language, line: string, end: number): TokenKind {
	if (language.keywords.has(word)) return 'keyword';
	if (/^[A-Z][A-Za-z0-9_]*$/.test(word) && word.length > 1) return 'type';
	if (line[end] === '(') return 'call';
	return 'plain';
}
