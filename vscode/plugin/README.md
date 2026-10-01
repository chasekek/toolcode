# TOOLCODE for VS Code

Runs the [TOOLCODE](../../README.md) terminal coding agent inside VS Code. TOOLCODE is a
full-screen terminal app, so the extension starts it in an integrated terminal (as an editor tab
beside your code, or in the panel) with the workspace folder as its root, and adds a few ways to
hand it files from the editor.

## Requirements

- Node.js 20 or newer (22+ on Windows for mouse support).
- TOOLCODE itself: `toolcode` on your `PATH`, or set `toolcode.path` to a built `dist/cli.js`
  (for example the one in this repository after `npm run build`).

## Sidebar

The TOOLCODE icon in the activity bar opens a panel with buttons to open a session, start a new
or orchestrator session, add the current file to the prompt, and set an API key.

## Commands

| Command | Default key | What it does |
|---|---|---|
| TOOLCODE: Open TOOLCODE | `Ctrl+Alt+T` | Shows the running session, or starts one. Also in the editor title bar and status bar. |
| TOOLCODE: Open New TOOLCODE Session | | Starts another session alongside the current one. |
| TOOLCODE: Open TOOLCODE in Orchestrator Mode | | Starts a session with `--orchestrator` (see `DELEGATION.md`). |
| TOOLCODE: Add to TOOLCODE Prompt | `Ctrl+Alt+K` | Types a reference such as `src/app.ts:12-20 ` into the prompt without sending it. Uses the editor selection, or the whole file from the explorer context menu. |
| TOOLCODE: Set OpenRouter API Key | | Saves a key in VS Code's secret storage; new sessions get it as `OPENROUTER_API_KEY`. |
| TOOLCODE: Clear OpenRouter API Key | | Removes it. TOOLCODE then falls back to your environment or a key saved with `/auth`. |

## Settings

| Setting | Default | Flag |
|---|---|---|
| `toolcode.path` | `toolcode` | Command to run; a `.js` path runs under `node`. |
| `toolcode.location` | `editor` | `editor` tab beside the current file, or `panel`. |
| `toolcode.ascii` | `false` | `--ascii` |
| `toolcode.mouse` | `true` | off passes `--no-mouse`, so the mouse selects text |
| `toolcode.orchestrator` | `false` | `--orchestrator` |
| `toolcode.plugins` | `[]` | `--plugin <path>` each; relative to the workspace folder |
| `toolcode.loadUserPlugins` | `true` | off passes `--no-plugins` |
| `toolcode.env` | `{}` | extra environment variables |

Settings apply to sessions started after the change.

## Development

```bash
cd vscode/plugin
npm install
npm run build       # tsc: src/ -> out/
npm test            # builds, then node --test on the pure launch helpers
```

Press `F5` with this folder open, or run `code --extensionDevelopmentPath=vscode/plugin`, to try
it in an Extension Development Host. `npx @vscode/vsce package` builds a `.vsix`.

`src/launch.ts` holds everything that does not need the VS Code API (flags, the launch command,
prompt references) so it can be tested with plain Node; `src/extension.ts` wires it to commands.
