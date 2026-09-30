import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {AskQuestion} from '../../tools/types.js';
import * as editor from '../editor.js';
import {useTheme} from '../theme.js';

const MAX_CONTEXT_LINES = 12;

interface Props {
	questions: AskQuestion[];
	width: number;
	/** One answer per question, or null if the user skipped. */
	onDone: (answers: string[] | null) => void;
}

/**
 * Questions from the ask tool, one at a time: pick an option with the arrows
 * or a number, or choose "Type an answer" to write your own.
 */
export function AskPanel({questions, width, onDone}: Props) {
	const {colors, symbols, borderStyle} = useTheme();
	const [index, setIndex] = useState(0);
	const [answers, setAnswers] = useState<string[]>([]);
	const question = questions[index]!;
	const options = question.options ?? [];
	const initialCursor = () => Math.max(0, options.indexOf(question.recommended ?? ''));
	const [cursor, setCursor] = useState(initialCursor);
	// With no options the only way to answer is typing.
	const [typing, setTyping] = useState(options.length === 0);
	const [draft, setDraft] = useState(editor.emptyEditor);
	const rows = options.length + 1; // options + "Type an answer"

	const submit = (answer: string) => {
		const next = [...answers, answer];
		if (index + 1 >= questions.length) return onDone(next);
		const upcoming = questions[index + 1]!;
		const upcomingOptions = upcoming.options ?? [];
		setAnswers(next);
		setIndex(index + 1);
		setCursor(Math.max(0, upcomingOptions.indexOf(upcoming.recommended ?? '')));
		setTyping(upcomingOptions.length === 0);
		setDraft(editor.emptyEditor);
	};

	useInput((input, key) => {
		if (key.ctrl && input === 'c') return onDone(null);
		if (typing) {
			if (key.escape) return options.length > 0 ? setTyping(false) : onDone(null);
			if (key.return) return draft.value.trim() && submit(draft.value.trim());
			if (key.leftArrow) return setDraft(editor.moveLeft(draft));
			if (key.rightArrow) return setDraft(editor.moveRight(draft));
			if (key.backspace || key.delete) return setDraft(editor.backspace(draft));
			if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow) return;
			const text = editor.sanitizePaste(input).replace(/\n/g, ' ');
			if (text) setDraft(editor.insert(draft, text));
			return;
		}
		if (key.escape) return onDone(null);
		if (key.upArrow) return setCursor(c => (c - 1 + rows) % rows);
		if (key.downArrow || key.tab) return setCursor(c => (c + 1) % rows);
		const pick = (i: number) => (i < options.length ? submit(options[i]!) : setTyping(true));
		if (key.return) return pick(cursor);
		const digit = Number.parseInt(input, 10);
		if (digit >= 1 && digit <= rows) pick(digit - 1);
	});

	const contextLines = question.context?.replace(/\n+$/, '').split('\n') ?? [];
	const hiddenContext = contextLines.length - MAX_CONTEXT_LINES;

	return (
		<Box flexDirection="column" borderStyle={borderStyle} borderColor={colors.accent} paddingX={1} width={width}>
			<Text wrap="wrap">
				{questions.length > 1 && (
					<Text color={colors.muted}>
						{index + 1}/{questions.length}{' '}
					</Text>
				)}
				<Text bold>{question.question}</Text>
			</Text>
			{contextLines.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					{contextLines.slice(0, MAX_CONTEXT_LINES).map((line, i) => (
						<Text key={i} color={colors.muted} wrap="truncate-end">
							{symbols.bar} {line}
						</Text>
					))}
					{hiddenContext > 0 && (
						<Text color={colors.muted}>
							{symbols.bar} {symbols.ellipsis} +{hiddenContext} more lines
						</Text>
					)}
				</Box>
			)}
			<Box flexDirection="column" marginTop={1}>
				{options.map((option, i) => {
					const active = !typing && i === cursor;
					return (
						<Text key={i} wrap="truncate-end" color={active ? colors.accent : undefined} bold={active}>
							{active ? `${symbols.pointer} ` : '  '}
							<Text color={colors.muted}>{i + 1}. </Text>
							{option}
							{option === question.recommended && <Text color={colors.success}> (recommended)</Text>}
						</Text>
					);
				})}
				{typing ? (
					<Text wrap="truncate-end">
						<Text color={colors.accent}>{symbols.prompt} </Text>
						{draft.value.slice(0, draft.cursor)}
						<Text inverse>{draft.value[draft.cursor] ?? ' '}</Text>
						{draft.value.slice(draft.cursor + 1)}
						{!draft.value && <Text color={colors.muted}>Type your answer</Text>}
					</Text>
				) : (
					<Text wrap="truncate-end" color={cursor === options.length ? colors.accent : colors.muted} bold={cursor === options.length}>
						{cursor === options.length ? `${symbols.pointer} ` : '  '}
						<Text color={colors.muted}>{options.length + 1}. </Text>
						Type an answer{symbols.ellipsis}
					</Text>
				)}
			</Box>
			<Box marginTop={1}>
				<Text color={colors.muted} wrap="truncate-end">
					{typing
						? `enter submit ${symbols.dot} esc ${options.length > 0 ? 'back to options' : 'skip'}`
						: `${symbols.arrowUpDown} move ${symbols.dot} enter select ${symbols.dot} 1-${rows} quick pick ${symbols.dot} esc skip`}
				</Text>
			</Box>
		</Box>
	);
}
