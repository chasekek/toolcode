// A provider with a custom stream() for APIs that aren't OpenAI-compatible.
// This one just echoes your message back, which is handy for testing plugins.
export default {
	name: 'echo',
	providers: [
		{
			id: 'echo',
			name: 'Echo',
			models: [{id: 'echo-1', label: 'Echo'}],
			async *stream({messages}) {
				// request = {model, apiKey, messages, tools, signal}
				const last = messages.at(-1);
				const text = last.role === 'user' ? `You said: ${last.content}` : 'Done.';
				for (const word of text.split(/(?<= )/)) {
					yield {type: 'text', delta: word};
				}
				// To call a tool instead:
				// yield {type: 'tool_call', call: {id: 'call_1', name: 'read_file', arguments: '{"path":"README.md"}'}};
			},
		},
	],
};
