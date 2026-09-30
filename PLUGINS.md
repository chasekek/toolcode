# TOOLCODE plugins

A plugin is one JavaScript file that adds **tools** (things the model can do), **providers** (where the model runs) and/or **commands** (slash commands you type). Nothing to install and nothing to import.

## Quick start

The easiest way is `/marketplace`: pick a plugin and press enter to install it. It works right away, without a restart. Press enter again to uninstall it.

To install your own:

1. Create `~/.toolcode/plugins/` (on Windows: `C:\Users\<you>\.toolcode\plugins\`).
2. Drop a `.js` file in it.
3. Restart `toolcode`. Type `/plugins` to check it loaded.

To try a plugin without installing it, run `toolcode --plugin path/to/plugin.js`. You can repeat the flag. Use `--no-plugins` to skip the plugins folder.

Working examples are in [`plugins/`](plugins): providers in `providers/`, tools in `tools/`, commands in `commands/`. To load them all: `toolcode --plugin plugins`.

## Add a tool

```js
export default {
  tools: [
    {
      name: 'shout',
      description: 'Return the given text in upper case.',
      parameters: {
        type: 'object',
        properties: {text: {type: 'string', description: 'Text to shout'}},
        required: ['text'],
      },
      run({text}) {
        return text.toUpperCase();
      },
    },
  ],
};
```

That's a complete plugin. `run` gets the arguments the model sent, plus a context object:

| `ctx` field | What it is |
|---|---|
| `ctx.cwd` | The workspace root. |
| `ctx.resolvePath(p)` | Turns a relative path into an absolute one. Throws if the path is outside the workspace. |
| `ctx.signal` | An `AbortSignal` that fires when the user presses esc. Pass it to `fetch` and other slow work. |
| `ctx.session.todos` | The agent's current task list (`{id, text, status, deps}`), for tools that want to read it. It resets on `/clear`. |
| `ctx.ask(questions)` | Asks the user, e.g. `await ctx.ask([{question: 'Deploy?', options: ['Yes', 'No']}])`. Resolves to one answer per question, or `null` if they skipped. It is undefined when there's no interactive UI, so check for it first. |

**Returning a result:** return a string, or `{content, summary?, output?, error?}` if you want control over the UI:

- `content` is sent to the model.
- `summary` is the one line the user sees, for example "Found 3 matches".
- `output` is the longer text shown with ctrl+o.
- `error: true` marks the call as failed.

Throwing an `Error` also reports a failure, and the model sees the message.

**Optional tool fields:**

| Field | Default | Purpose |
|---|---|---|
| `label` | `name` | Name shown in the UI, e.g. `Search`. |
| `readOnly` | `false` | Set `true` if the tool never changes anything. Only read-only tools run in plan mode, `/improve` and `/judge`. |
| `describe(args)` | first string argument | Text shown next to the label, e.g. the file path. |
| `parameters` | no arguments | A JSON Schema object describing the arguments. |

Tool names may only use letters, digits, `_` and `-`, and can't clash with a built-in (`read_file`, `write_file`, `delete_file`, `todo_write`, `ask`) or another plugin's tool.

## Add a command

```js
export default {
  commands: [
    {
      name: 'helloworld',
      description: 'Reply with hello world',
      run(args, ctx) {
        return 'hello world';
      },
    },
  ],
};
```

Type `/helloworld` and the reply shows up in the conversation. `args` is the text typed after the command, and `ctx.cwd` is the workspace root. `run` can be async. A string it returns is shown as the reply; returning nothing shows nothing. Commands run on your machine and the model never sees them. Names use lowercase letters, digits and `-`, and can't clash with built-in commands.

## Add a provider

Most model APIs (OpenAI, Groq, Together, Mistral, DeepSeek, LM Studio, Ollama, vLLM, and others) speak the OpenAI format. For those you only need a `baseUrl`:

```js
export default {
  providers: [
    {
      id: 'groq',
      name: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKeyEnv: 'GROQ_API_KEY',
      models: ['llama-3.3-70b-versatile', {id: 'qwen-qwq-32b', label: 'Qwen QwQ'}],
    },
  ],
};
```

- Leave out `apiKeyEnv` for local servers that need no key.
- `headers` adds extra HTTP headers to every request.
- Plugin models show up in `/model`. You can also pick one directly with `/model groq:llama-3.3-70b-versatile`.
- The model needs to support tool calling to edit files.

### llama.cpp (local models)

[`llamacpp.js`](plugins/providers/llamacpp.js) connects to a local `llama-server`. Start the server with `--jinja`, which tool calling needs:

```
llama-server -m path/to/model.gguf --jinja -c 16384
toolcode --plugin plugins/providers/llamacpp.js
```

Then pick **llama.cpp** in `/model`. The plugin asks the server which model is loaded. If the server runs on a different address, set `LLAMACPP_URL` (default `http://127.0.0.1:8080`). Set `LLAMACPP_API_KEY` only if you started the server with `--api-key`. Pick a model trained for tool calling, such as Qwen2.5-Coder, Qwen3 or Llama 3.1+, with at least 16k of context.

### Custom APIs

For an API that isn't OpenAI-compatible, write a `stream` function instead of giving a `baseUrl`. It is an async generator. It receives `{model, apiKey, messages, tools, signal}`, where `messages` and `tools` use the OpenAI chat format, and it yields:

```js
{type: 'text', delta: 'some text'}
{type: 'tool_call', call: {id: 'call_1', name: 'read_file', arguments: '{"path":"a.txt"}'}}
```

Yield `tool_call` events once each call is complete. TOOLCODE runs the tools and calls `stream` again with the results. See [`echo-provider.js`](plugins/providers/echo-provider.js).

## The marketplace

`/marketplace` lists the plugins in [`plugins/marketplace.json`](plugins/marketplace.json). Installing one copies its file to `~/.toolcode/plugins/<id>.mjs` and loads it on the spot. Uninstalling unloads it and deletes the file. To add a plugin to the list, put its file under `plugins/` and add an entry:

```json
{"id": "my-plugin", "name": "My Plugin", "category": "tool", "description": "One line about it.", "file": "tools/my-plugin.js"}
```

`category` is `tool`, `provider` or `command`. The catalog ships inside the package, so the marketplace never downloads code from the internet. Set `TOOLCODE_PLUGIN_DIR` to use a different plugins folder.

## More

- **Types:** if you write plugins in TypeScript or want autocomplete, `import {definePlugin} from '@chasekek/toolcode/plugin'` and wrap your export in it. Doing this is optional.
- **Setup code:** `export default` can also be a function (async is fine) that returns the plugin, which is useful for setup work.
- **Folders:** a plugin can be a folder with an `index.js`. A folder without one is a grouping folder, so you can sort plugins into `~/.toolcode/plugins/providers/` and `~/.toolcode/plugins/tools/`. Files and folders starting with `.` or `_` are ignored.
- **Errors:** a plugin that throws while loading is skipped, and the error is shown when TOOLCODE starts. It never stops the app.

> **Security:** plugins are ordinary code and run with your permissions. Only install plugins you trust. TOOLCODE doesn't load plugins from the project folder automatically, so cloning a repo can't run code on your machine.
