import {useCallback, useEffect, useRef, useState} from 'react';
import {isAbortError} from '../../core/abort.js';
import {runAgent} from '../../core/agent.js';
import type {Todo} from '../../core/todos.js';
import type {AssistantMessage, Message, NoticeLevel, StreamEvent, TurnKind} from '../../core/types.js';
import {demoStream} from '../../providers/demo.js';
import type {ChatMessage, Provider} from '../../providers/types.js';
import type {AskQuestion, Session} from '../../tools/types.js';

/** Questions from the ask tool waiting for the user. */
export interface PendingAsk {
	id: string;
	questions: AskQuestion[];
	answer: (answers: string[] | null) => void;
}

export interface ChatRequest {
	/** Text sent to the model. */
	prompt: string;
	/** Text shown in the transcript for the user turn. */
	display: string;
	kind: TurnKind;
	/** Run the turn in orchestrator mode. */
	orchestrator?: boolean;
}

interface Options {
	provider: Provider;
	/** Without a key, turns run against the offline demo stream. */
	apiKey: string | undefined;
	model: string;
	simulateErrors: boolean;
}

// Stream deltas are batched so a fast model doesn't trigger a render per token.
const FLUSH_MS = 32;

// Marks replies from plugin commands, which aren't model output.
const COMMAND_MODEL = 'command';

let counter = 0;
const nextId = () => `m${++counter}`;

function cloneAssistant(message: AssistantMessage): AssistantMessage {
	return {
		...message,
		parts: message.parts.map(p => (p.type === 'tool' ? {type: 'tool', call: {...p.call}} : {...p})),
	};
}

function applyEvent(draft: AssistantMessage, event: StreamEvent) {
	switch (event.type) {
		case 'text': {
			const last = draft.parts.at(-1);
			if (last?.type === 'text') last.text += event.delta;
			else draft.parts.push({type: 'text', text: event.delta.trimStart()});
			break;
		}
		case 'tool_start':
			draft.parts.push({type: 'tool', call: {...event.call, status: 'running', startedAt: Date.now()}});
			break;
		case 'tool_end':
			for (const part of draft.parts) {
				if (part.type === 'tool' && part.call.id === event.id && part.call.status === 'running') {
					Object.assign(part.call, {status: event.status, summary: event.summary, output: event.output, endedAt: Date.now()});
				}
			}
			break;
	}
}

/**
 * Conversation state. Finished turns live in `history`, the current turn in
 * `live`; only `live` changes while a reply streams, so memoized views of
 * older messages are left alone.
 */
export function useChat({provider, apiKey, model, simulateErrors}: Options) {
	const [state, setState] = useState<{history: Message[]; live: Message[]}>({history: [], live: []});
	const [busy, setBusy] = useState(false);
	const [startedAt, setStartedAt] = useState(0);
	const busyRef = useRef(false);
	const abortRef = useRef<AbortController | null>(null);
	const draftRef = useRef<AssistantMessage | null>(null);
	const flushTimer = useRef<NodeJS.Timeout | null>(null);
	const lastRequest = useRef<ChatRequest | null>(null);
	// What the model sees across turns, and its length before the last request (for /retry).
	const modelHistory = useRef<ChatMessage[]>([]);
	const historyMark = useRef(0);
	const session = useRef<Session>({todos: []});
	const [todos, setTodos] = useState<Todo[]>([]);
	const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null);

	const flush = useCallback(() => {
		if (flushTimer.current) clearTimeout(flushTimer.current);
		flushTimer.current = null;
		const draft = draftRef.current;
		if (!draft) return;
		const snapshot = cloneAssistant(draft);
		setState(s => ({...s, live: s.live.map(m => (m.id === snapshot.id ? snapshot : m))}));
	}, []);

	const scheduleFlush = useCallback(() => {
		if (!flushTimer.current) flushTimer.current = setTimeout(flush, FLUSH_MS);
	}, [flush]);

	useEffect(() => () => abortRef.current?.abort(), []);

	const send = useCallback(
		async (request: ChatRequest, retrying = false) => {
			if (busyRef.current) return;
			busyRef.current = true;
			lastRequest.current = request;
			if (retrying) modelHistory.current.length = historyMark.current;
			else historyMark.current = modelHistory.current.length;
			const controller = new AbortController();
			abortRef.current = controller;

			const draft: AssistantMessage = {id: nextId(), role: 'assistant', parts: [], status: 'streaming', model};
			draftRef.current = draft;
			setState(s => ({
				history: [...s.history, ...s.live],
				live: [{id: nextId(), role: 'user', text: request.display}, cloneAssistant(draft)],
			}));
			setBusy(true);
			setStartedAt(Date.now());

			// Resolves when the user answers or skips; an interrupt (esc) counts as skipping.
			const ask = (questions: AskQuestion[]) =>
				new Promise<string[] | null>(resolve => {
					const finish = (answers: string[] | null) => {
						controller.signal.removeEventListener('abort', onAbort);
						setPendingAsk(null);
						resolve(answers);
					};
					const onAbort = () => finish(null);
					if (controller.signal.aborted) return finish(null);
					controller.signal.addEventListener('abort', onAbort, {once: true});
					flush();
					setPendingAsk({id: nextId(), questions, answer: finish});
				});

			try {
				const stream = apiKey !== undefined
					? runAgent({
							provider,
							apiKey,
							model,
							cwd: process.cwd(),
							kind: request.kind,
							input: request.prompt,
							history: modelHistory.current,
							signal: controller.signal,
							session: session.current,
							ask,
							orchestrator: request.orchestrator,
						})
					: demoStream(request.prompt, {
							kind: request.kind,
							model,
							signal: controller.signal,
							fail: simulateErrors,
						});
				for await (const event of stream) {
					applyEvent(draft, event);
					scheduleFlush();
					if (event.type === 'tool_end') setTodos(session.current.todos);
				}
				draft.status = 'done';
			} catch (error) {
				if (isAbortError(error)) {
					draft.status = 'interrupted';
				} else {
					draft.status = 'error';
					draft.error = error instanceof Error ? error.message : String(error);
				}
				for (const part of draft.parts) {
					if (part.type === 'tool' && part.call.status === 'running') {
						Object.assign(part.call, {status: 'error', summary: 'Cancelled', endedAt: Date.now()});
					}
				}
			} finally {
				flush();
				draftRef.current = null;
				abortRef.current = null;
				busyRef.current = false;
				setBusy(false);
			}
		},
		[provider, apiKey, model, simulateErrors, flush, scheduleFlush],
	);

	const cancel = useCallback(() => abortRef.current?.abort(), []);

	const retry = useCallback(() => {
		if (!lastRequest.current) return false;
		void send(lastRequest.current, true);
		return true;
	}, [send]);

	const notify = useCallback((level: NoticeLevel, text: string) => {
		setState(s => ({...s, live: [...s.live, {id: nextId(), role: 'notice', level, text}]}));
	}, []);

	/** Shows a plugin command and its reply as an exchange; the model never sees it. */
	const commandReply = useCallback((input: string, text: string) => {
		setState(s => ({
			...s,
			live: [
				...s.live,
				{id: nextId(), role: 'user', text: input},
				{id: nextId(), role: 'assistant', parts: [{type: 'text', text}], status: 'done', model: COMMAND_MODEL},
			],
		}));
	}, []);

	const clear = useCallback(() => {
		abortRef.current?.abort();
		modelHistory.current = [];
		historyMark.current = 0;
		session.current = {todos: []};
		setTodos([]);
		setState({history: [], live: []});
	}, []);

	const lastAssistant = [...state.history, ...state.live]
		.reverse()
		.find((m): m is AssistantMessage => m.role === 'assistant' && m.status === 'done' && m.model !== COMMAND_MODEL);

	return {
		history: state.history,
		live: state.live,
		busy,
		startedAt,
		send,
		cancel,
		retry,
		notify,
		commandReply,
		clear,
		hasLastRequest: () => lastRequest.current !== null,
		lastAssistant,
		todos,
		pendingAsk,
	};
}
