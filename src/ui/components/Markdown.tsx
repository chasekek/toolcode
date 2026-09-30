import {memo, type ReactNode} from 'react';
import {Box, Text} from 'ink';
import {highlightLine, languageFor, type HighlightState, type Token, type TokenKind} from '../highlight.js';
import {expandTabs} from '../text.js';
import {useTheme, type Colors} from '../theme.js';

/** Theme color for each kind of code token; plain text keeps the terminal's color. */
export function tokenColor(kind: TokenKind, colors: Colors): string | undefined {
	switch (kind) {
		case 'keyword':
			return colors.accent;
		case 'string':
			return colors.success;
		case 'number':
			return colors.warning;
		case 'comment':
			return colors.muted;
		case 'type':
			return colors.info;
		case 'call':
			return colors.primary;
		default:
			return undefined;
	}
}

/** One line of highlighted source. */
export function CodeLine({tokens, wrap}: {tokens: Token[]; wrap?: 'wrap' | 'truncate-end'}) {
	const {colors} = useTheme();
	return (
		<Text wrap={wrap}>
			{tokens.map((token, i) => (
				<Text key={i} color={tokenColor(token.kind, colors)} italic={token.kind === 'comment'}>
					{token.text}
				</Text>
			))}
			{tokens.every(t => t.text === '') && ' '}
		</Text>
	);
}

/** Tokens for consecutive lines, carrying block comments from one line to the next. */
export function highlightLines(lines: string[], lang: string | undefined): Token[][] {
	const state: HighlightState = {inBlockComment: false};
	return lines.map(line => highlightLine(line, lang, state));
}

/** `**bold**`, `inline code`, and [links](url) inside one line. */
function Inline({text, color}: {text: string; color?: string}) {
	const {colors} = useTheme();
	const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g).filter(Boolean);
	return (
		<Text color={color}>
			{tokens.map((token, i) => {
				if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
					return (
						<Text key={i} bold>
							{token.slice(2, -2)}
						</Text>
					);
				}
				if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
					return (
						<Text key={i} color={colors.primary}>
							{token.slice(1, -1)}
						</Text>
					);
				}
				const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
				if (link) {
					return (
						<Text key={i}>
							<Text color={colors.primary} underline>
								{link[1]}
							</Text>
							<Text color={colors.muted}> ({link[2]})</Text>
						</Text>
					);
				}
				return token;
			})}
		</Text>
	);
}

/** A fenced block: language tag, a gutter down the side, highlighted lines. */
function CodeBlock({lang, lines}: {lang: string; lines: string[]}) {
	const {colors, symbols} = useTheme();
	const {box} = symbols;
	const highlighted = highlightLines(lines, languageFor(lang));
	return (
		<Box flexDirection="column">
			<Text color={colors.border}>
				{box.topLeft}
				{box.horizontal}
				{lang && <Text color={colors.muted}> {lang}</Text>}
			</Text>
			{highlighted.map((tokens, i) => (
				<Box key={i}>
					<Box width={2} flexShrink={0}>
						<Text color={colors.border}>{box.vertical}</Text>
					</Box>
					<CodeLine tokens={tokens} />
				</Box>
			))}
			<Text color={colors.border}>
				{box.bottomLeft}
				{box.horizontal}
			</Text>
		</Box>
	);
}

/**
 * A horizontal rule as wide as the text. Drawn as a top border rather than a
 * clipped run of dashes: this sits in scrolled content, where a clipping box
 * would escape the panel's clip (Ink only honors the innermost one).
 */
function Rule() {
	const {colors, borderStyle} = useTheme();
	return (
		<Box
			// Remounted with the theme: Ink re-applies only changed styles, which would restore the hidden sides.
			key={borderStyle}
			flexGrow={1}
			borderStyle={borderStyle === 'round' ? 'single' : 'classic'}
			borderTop
			borderBottom={false}
			borderLeft={false}
			borderRight={false}
			borderColor={colors.border}
		/>
	);
}

/**
 * Markdown subset tuned for terminal output: headings, bullet and numbered
 * lists, quotes, rules, fenced code with highlighting, bold, code and links.
 */
export const Markdown = memo(function Markdown({text}: {text: string}) {
	const {colors, symbols} = useTheme();
	const lines = expandTabs(text).replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '').split('\n');
	const blocks: ReactNode[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const fence = /^\s*```\s*([\w+#.-]*)/.exec(line);
		if (fence) {
			const body: string[] = [];
			let j = i + 1;
			while (j < lines.length && !/^\s*```/.test(lines[j]!)) body.push(lines[j++]!);
			// An unclosed fence is still streaming: show what has arrived.
			blocks.push(<CodeBlock key={i} lang={fence[1] ?? ''} lines={body} />);
			i = j;
			continue;
		}
		if (line.trim() === '') {
			blocks.push(<Text key={i}> </Text>);
			continue;
		}

		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			const level = heading[1]!.length;
			blocks.push(
				<Text key={i} bold color={level <= 2 ? colors.primary : undefined} underline={level === 1}>
					{heading[2]}
				</Text>,
			);
			continue;
		}

		if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
			blocks.push(<Rule key={i} />);
			continue;
		}

		const quote = /^\s*>\s?(.*)$/.exec(line);
		if (quote) {
			blocks.push(
				<Box key={i}>
					<Box width={2} flexShrink={0}>
						<Text color={colors.accent}>{symbols.bar}</Text>
					</Box>
					<Inline text={quote[1]!} color={colors.muted} />
				</Box>,
			);
			continue;
		}

		const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
		if (bullet) {
			const task = /^\[([ xX])\]\s+(.*)$/.exec(bullet[2]!);
			blocks.push(
				<Box key={i} paddingLeft={bullet[1]!.length}>
					<Box width={2} flexShrink={0}>
						<Text color={task ? (task[1] === ' ' ? colors.muted : colors.success) : colors.accent}>
							{task ? (task[1] === ' ' ? symbols.todoReady : symbols.todoDone) : symbols.listBullet}
						</Text>
					</Box>
					<Inline text={task ? task[2]! : bullet[2]!} />
				</Box>,
			);
			continue;
		}

		const numbered = /^(\s*)(\d+[.)])\s+(.*)$/.exec(line);
		if (numbered) {
			blocks.push(
				<Box key={i} paddingLeft={numbered[1]!.length}>
					<Box width={numbered[2]!.length + 1} flexShrink={0}>
						<Text color={colors.accent}>{numbered[2]}</Text>
					</Box>
					<Inline text={numbered[3]!} />
				</Box>,
			);
			continue;
		}

		blocks.push(<Inline key={i} text={line} />);
	}

	return <Box flexDirection="column">{blocks}</Box>;
});
