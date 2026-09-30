import type {AskQuestion, Tool} from './types.js';

const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 6;

function parseQuestions(value: unknown): AskQuestion[] {
	if (!Array.isArray(value) || value.length === 0) throw new Error('"questions" must be a non-empty array.');
	if (value.length > MAX_QUESTIONS) throw new Error(`Ask at most ${MAX_QUESTIONS} questions at a time.`);
	return value.map((raw, i) => {
		const item = (raw ?? {}) as Record<string, unknown>;
		if (typeof item['question'] !== 'string' || !item['question'].trim()) throw new Error(`Question #${i + 1} needs "question" text.`);
		const options = Array.isArray(item['options']) ? item['options'].map(String).filter(o => o.trim()) : [];
		if (options.length > MAX_OPTIONS) throw new Error(`Question #${i + 1} has more than ${MAX_OPTIONS} options.`);
		const recommended = typeof item['recommended'] === 'string' && options.includes(item['recommended']) ? item['recommended'] : undefined;
		const context = typeof item['context'] === 'string' && item['context'].trim() ? item['context'] : undefined;
		return {question: item['question'].trim(), options, recommended, context};
	});
}

export const ask: Tool = {
	name: 'ask',
	label: 'Ask',
	description:
		'Ask the user one or more questions and wait for the answers. Use it when a request is ambiguous or a decision ' +
		'is genuinely theirs (naming, trade-offs, scope). Do not ask about things you can find out by reading files. ' +
		'Offer options when there are clear choices, and set "recommended" to the one you would pick.',
	parameters: {
		type: 'object',
		properties: {
			questions: {
				type: 'array',
				description: `1-${MAX_QUESTIONS} questions, asked one after another.`,
				items: {
					type: 'object',
					properties: {
						question: {type: 'string', description: 'The question to ask.'},
						options: {type: 'array', items: {type: 'string'}, description: `Up to ${MAX_OPTIONS} short choices. The user can also type their own answer.`},
						recommended: {type: 'string', description: 'The option you recommend; must match one of the options exactly.'},
						context: {type: 'string', description: 'Optional extra context shown above the options, such as a short code snippet.'},
					},
					required: ['question'],
				},
			},
		},
		required: ['questions'],
		additionalProperties: false,
	},
	readOnly: true,
	describe: args => {
		const first = Array.isArray(args['questions']) ? (args['questions'][0] as {question?: unknown})?.question : undefined;
		return typeof first === 'string' ? first : '';
	},
	async run(args, ctx) {
		const questions = parseQuestions(args['questions']);
		if (!ctx.ask) throw new Error('Asking the user is not available here. Make a reasonable assumption and say what you assumed.');

		const answers = await ctx.ask(questions);
		if (!answers) {
			return {status: 'success', summary: 'Skipped by user', content: 'The user skipped the questions. Proceed with your best judgment and state your assumptions.'};
		}
		const pairs = questions.map((q, i) => `Q: ${q.question}\nA: ${answers[i] ?? '(no answer)'}`);
		return {
			status: 'success',
			summary: questions.length === 1 ? `Answered: ${answers[0]}` : `Answered ${questions.length} questions`,
			output: pairs.join('\n\n'),
			content: pairs.join('\n\n'),
		};
	},
};
