// Keyless provider used by the UI tests: asks two questions, writes a todo list, then answers.
export default {
	providers: [
		{
			id: 'scripted',
			models: ['script'],
			async *stream({messages}) {
				const toolResults = messages.filter(m => m.role === 'tool').length;
				const call = (name, args) => ({type: 'tool_call', call: {id: `c${toolResults}`, name, arguments: JSON.stringify(args)}});
				if (messages.at(-1).role === 'user') {
					yield {type: 'text', delta: 'One question first.'};
					yield call('ask', {questions: [{question: 'Which framework?', options: ['React', 'Vue'], recommended: 'Vue', context: 'No framework in package.json yet.'}, {question: 'Project name?'}]});
				} else if (toolResults === 1) {
					yield call('todo_write', {todos: [{id: '1', text: 'Scaffold app', status: 'done'}, {id: '2', text: 'Add router', status: 'doing', deps: ['1']}, {id: '3', text: 'Write tests', deps: ['2']}]});
				} else {
					yield {type: 'text', delta: `Got: ${messages.findLast(m => m.role === 'tool' && m.content.startsWith('Q:'))?.content.replace(/\n/g, ' | ') ?? 'no answers'}`};
				}
			},
		},
	],
};
