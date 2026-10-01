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
| `keywords` | none | Words that point at the tool, e.g. `['judge']`. When a message uses one ("judge whether…", "judging"), the model is told the tool fits and decides for itself whether to call it. Typing `@tool_name` asks for a tool outright. |
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
- Providers with an `apiKeyEnv` are listed in `/auth`, where users can paste a key instead of exporting the variable. Keys are saved per provider id in `~/.toolcode/auth.json`; the environment variable wins when both are set.
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

The popup is filterable: `tab` or the left/right arrows move between **all**, **tool**, **provider**
and **command**, and the number keys `1`-`4` jump straight to one. The entry under the cursor is
described at the bottom of the popup; `enter` installs or uninstalls it and `esc` goes back.

Entries show three states. **install** copies the plugin into the plugins folder; **installed**
means that file is there and `enter` removes it again; **loaded** means the plugin already
runs from somewhere else — say you started with `--plugin plugins` — so there is nothing to
install and `enter` only says where it came from.

## Code judges

Two bundled plugins check code with a **decision model** instead of a chat model. You describe
the situation and define the legal answers; the model returns a probability for each one. There is no
prose to parse, and an answer it cannot fill in is never read as approval.

Both send the identical state and the same four typed questions — `correct` and `safe_to_run`
(yes/no), `worst_issue` (0–4) and `verdict` (ship / fix / rewrite / ask) — and both gate on
`correct >= 0.8` and `safe_to_run >= 0.7`.

| | [`jevjudge.js`](plugins/tools/jevjudge.js) | [`jeffjudge.js`](plugins/tools/jeffjudge.js) |
|---|---|---|
| Model | JEV `jev-1.13-free` on [BeatAPI](https://beatapi.io/jev-api) | [Jeff](https://huggingface.co/mstrasser/Jeff-Qwen3.5-0.8B) on your machine |
| Needs | A free BeatAPI key | llama.cpp or Ollama |
| Code leaves the machine | Yes | No |
| Cost | Free, one successful request per minute | Local |

Install either from `/marketplace`, or `toolcode --plugin plugins`.

**jevjudge** is the default. Get a key at <https://dashboard.beatapi.io> and either export
`BEATAPI_API_KEY` or run `/jevjudge setup <key>`. The free tier allows one successful request per
minute; over that the API answers `429` and the tool says so instead of retrying. If the call fails,
or the key is missing, a configured local Jeff model answers instead, so you still get a verdict.

The key is stored in `~/.toolcode/plugins/.jevjudge.json`, never in the plugin file, so it does not
ship with the package and never lands in a repository. Set `BEATAPI_URL` or `BEATAPI_JEV_MODEL` to
point somewhere else.

**jeffjudge** keeps everything local. Run `/jeffjudge setup` and pick the runtime (Ollama or
llama.cpp) and the model size: **Jeff-Qwen3.5-0.8B** (1.7 GB) for low-RAM machines, or
**Jeff-Qwen3.5-2B** (4.2 GB) on a decent one. `/jeffjudge status` prints the conversion and start
commands for whichever you chose. Upstream ships safetensors plus a separate decision head, and both
runtimes serve GGUF, so the converted model answers in strict JSON mode rather than emitting the
head's class probabilities; the questions and thresholds are the same either way. For the real head,
run `jeff-serve` from [firelex/jeff](https://github.com/firelex/jeff).

Both tools are read-only, so they also run in plan mode, `/improve` and `/judge`. Neither is
required: each loads and lists in `/plugins` whether or not it is set up, and reports that it is
unconfigured only when you actually call it. Settings live beside the plugins in
`~/.toolcode/plugins/.jevjudge.json` and `.jeffjudge.json`, not in `/auth`.

## More

- **Types:** if you write plugins in TypeScript or want autocomplete, `import {definePlugin} from 'toolcode/plugin'` and wrap your export in it. Doing this is optional.
- **Setup code:** `export default` can also be a function (async is fine) that returns the plugin, which is useful for setup work.
- **Folders:** a plugin can be a folder with an `index.js`. A folder without one is a grouping folder, so you can sort plugins into `~/.toolcode/plugins/providers/` and `~/.toolcode/plugins/tools/`. Files and folders starting with `.` or `_` are ignored.
- **Errors:** a plugin that throws while loading is skipped, and the error is shown when TOOLCODE starts. It never stops the app.
- **Logging:** TOOLCODE draws the whole terminal, so `console.log`, `console.warn` and `console.error` from a plugin appear as notices in the conversation rather than on the screen.

> **Security:** plugins are ordinary code and run with your permissions. Only install plugins you trust. TOOLCODE doesn't load plugins from the project folder automatically, so cloning a repo can't run code on your machine.
