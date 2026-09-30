// Keyless provider for the UI smoke tests: plans with todos, creates, edits and
// deletes files in the working directory, then answers at length so the
// conversation scrolls. Run it from a scratch directory that has a legacy.js.

const APP = `// Tiny HTTP server for the demo.
import {createServer} from 'node:http';

const PORT = Number(process.env.PORT ?? 3000);

/* Routes map a path to a handler. */
const routes = {
	'/': () => 'hello',
	'/health': () => 'ok',
};

export function handle(url) {
	const route = routes[url];
	return route ? route() : 'not found';
}

createServer((req, res) => res.end(handle(req.url))).listen(PORT);
`;

const APP_EDITED = APP.replace("'/health': () => 'ok',", "'/health': () => 'ok',\n\t'/version': () => '1.0.0',");

const ANSWER = `## Done

The server is in \`src/app.ts\` and the notes are in \`notes.md\`. I removed **legacy.js**.

- \`/\` answers hello
- \`/health\` answers ok
- \`/version\` answers the version

\`\`\`ts
import {handle} from './src/app.ts';

console.log(handle('/version')); // "1.0.0"
\`\`\`

1. Start it with \`node src/app.ts\`
2. Open http://localhost:3000
3. Check /health from your monitor

Next steps worth taking:

- add tests for \`handle\`
- read the port from a config file
- log each request with its duration
- add a graceful shutdown on SIGTERM
- serve static files from public/
- return JSON from /health

> Everything above ran in plan-free mode.`;

export default {
	providers: [
		{
			id: 'workspace',
			name: 'Workspace',
			models: ['builder'],
			async *stream({messages}) {
				const results = messages.filter(m => m.role === 'tool').length;
				const call = (n, name, args) => ({type: 'tool_call', call: {id: `c${results}_${n}`, name, arguments: JSON.stringify(args)}});
				if (messages.at(-1).role === 'user') {
					yield {type: 'text', delta: "I'll plan it, then write the server."};
					yield call(0, 'todo_write', {
						todos: [
							{id: '1', text: 'Plan the routes', status: 'done'},
							{id: '2', text: 'Write the server', status: 'doing', deps: ['1']},
							{id: '3', text: 'Add a version route', deps: ['2']},
							{id: '4', text: 'Remove legacy code', deps: ['2']},
						],
					});
					yield call(1, 'write_file', {path: 'src/app.ts', content: APP});
					yield call(2, 'write_file', {path: 'notes.md', content: '# Notes\n\nRoutes live in src/app.ts.\n'});
				} else if (results === 3) {
					yield {type: 'text', delta: 'Adding the version route and cleaning up.'};
					yield call(0, 'write_file', {path: 'src/app.ts', content: APP_EDITED});
					yield call(1, 'delete_file', {path: 'legacy.js'});
					yield call(2, 'todo_write', {
						todos: [
							{id: '1', text: 'Plan the routes', status: 'done'},
							{id: '2', text: 'Write the server', status: 'done', deps: ['1']},
							{id: '3', text: 'Add a version route', status: 'done', deps: ['2']},
							{id: '4', text: 'Remove legacy code', status: 'doing', deps: ['2']},
						],
					});
				} else {
					yield {type: 'text', delta: ANSWER};
				}
			},
		},
	],
};
