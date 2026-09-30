// A command plugin: adds /helloworld, which replies "hello world".
export default {
	name: 'hello-world',
	commands: [
		{
			name: 'helloworld',
			description: 'Reply with hello world',
			run() {
				return 'hello world';
			},
		},
	],
};
