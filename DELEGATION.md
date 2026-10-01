# Delegation and Orchestrator Mode

TOOLCODE can hand coding work to other AI coding CLIs, starting with
[Claude Code](https://docs.anthropic.com/en/docs/claude-code). TOOLCODE stays the manager: it
decides what to delegate, writes the task, checks what came back, and reports to you. The
delegated CLI is a worker that gets one self-contained task, edits the shared workspace, and
exits.

This lets a small or local model take on big jobs. The model plans the work and checks the
results, and a stronger agent does the hard parts.

## Claude Code delegation

### What it is

The `delegate` tool runs `claude -p` (Claude Code's headless mode) in your workspace with a
task that TOOLCODE wrote. When it finishes, TOOLCODE gets a structured result:

```text
agent: Claude Code
status: success            # success | failure | timeout | not_installed | permission_error | unknown_error
exit_code: 0
duration_s: 14
files_changed: 2
  added: math.test.js
  modified: math.js
diff_stat: ...
commands_run:
  $ node math.test.js
summary:
I fixed add() and added a test...
```

`files_changed` comes from comparing `git status` before and after the run, not from what the
agent says it did. If a file already had uncommitted changes before the run, it is only listed
when the run changed it again, and it is marked as such. Fields TOOLCODE can't work out are
shown as `unavailable` rather than guessed. Outside a git repository, for example,
`files_changed` is unavailable, and the model is told to read the files itself.

Press `ctrl+o` on the tool call to see Claude Code's full output.

### Enabling it

[Install Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup) and sign in once by
running `claude` in a terminal. Delegation is on by default whenever `claude` is on your PATH.
TOOLCODE also looks in `~/.local/bin` and `~/.claude/local`.

Type `/agents` to check:

```text
Claude Code: available (2.1.286)
  commands ask · timeout 20 min · default mode implement
Up to 3 agents in parallel, 1 retry per failed task.
```

### How TOOLCODE decides to delegate

The model decides for itself. Its instructions say to delegate when another agent would clearly
do the work better: large refactors, multi-file features, hard debugging, repository-wide
changes, fixing failing tests, or anything that needs shell commands (TOOLCODE has no shell tool
of its own). Small edits, one-line fixes and plain questions it handles itself, because
delegation is slow.

After a delegation, the model is told to read the changed files before calling the work done.
If a delegation fails, it can fix the task and retry once, do the work itself, or ask you. The
same task can't be delegated more than `maxRetries + 1` times in a conversation.

### Explicit delegation

Say so in your message, and the model is instructed to delegate rather than explain how:

```text
Use Claude Code to refactor the API.
Have Claude Code implement the database migration.
Ask Claude Code to fix the tests.
Delegate this entire task.
Use a subagent for this.
```

To stop delegation for a message:

```text
Don't delegate this.
Do it yourself.
```

When you say this, the delegation tools are removed from that turn completely, so the model
can't delegate even by mistake. `Don't use parallel agents` (or `one at a time`) makes
orchestrated tasks run one after another.

### Permissions

Delegation never gives Claude Code more than you approved:

| Situation | Claude Code runs with |
|---|---|
| `mode: investigate` | `--permission-mode plan`: reads only, edits nothing |
| `mode: implement` (default) | `--permission-mode acceptEdits`: edits files in the workspace, shell tools disallowed |
| `allow_commands` requested | Shell tools (Bash, PowerShell) only allowed after you approve |

TOOLCODE has no shell tool, so letting Claude Code run commands is a new capability. By default
(`"commands": "ask"`) you are asked each time, through the same question panel as the `ask`
tool. Without an interactive UI the answer is always no. `bypassPermissions` is never used.

The task prompt also tells Claude Code not to commit, reset, stash, check out, or discard
changes, and not to start another agent. TOOLCODE itself only runs read-only git commands
(`status`, `rev-parse`, `diff`) and warns if `HEAD` moves during a run.

### Recursion

Every agent TOOLCODE starts gets `TOOLCODE_DELEGATION_DEPTH` set to one more than its own. A
TOOLCODE started at a depth of `maxDepth` (default 1) or more doesn't offer delegation tools
at all, which stops loops like ToolCode → Claude Code → ToolCode → ... from forming.

## Orchestrator Mode

### What it does

In orchestrator mode, TOOLCODE acts as a task manager rather than the coder. For a substantial
request it:

1. works out the goal and splits it into subtasks,
2. picks an agent for each one,
3. runs them with the `delegate_tasks` tool, respecting dependencies and running independent
   tasks in parallel,
4. reads the results and the changed files, resolves conflicts, and adds follow-up tasks for
   failures,
5. does small integration fixes itself and reports back.

### Activating it

```bash
toolcode --orchestrator          # start in orchestrator mode
```

Inside the app:

```text
/orchestrate                     # toggle orchestrator mode
/orchestrate build a login page  # turn it on and send this task
/agents                          # which agents are available, and the limits
```

The Prompt panel title shows `Prompt · orchestrator` and the Session panel shows
`Mode ◆ orchestrator`. To start in this mode every time, set `"orchestrator": {"enabled": true}`
(see below).

### How tasks are delegated

`delegate_tasks` takes a plan like this:

```json
{"tasks": [
  {"id": "backend",  "task": "Add POST /login ...",       "files": ["src/server"]},
  {"id": "frontend", "task": "Add the login form ...",    "files": ["src/web"]},
  {"id": "tests",    "task": "Write and run auth tests",   "depends_on": ["backend", "frontend"], "allow_commands": true}
]}
```

- A task starts only after every task in its `depends_on` has **succeeded**. Tasks that
  depend on a failed task are skipped, not run on a broken base.
- Up to `maxParallel` tasks run at once, but two editing tasks only run together when both
  list `files` and those files don't overlap. An editing task that lists no files runs on its
  own. Read-only (`investigate`) tasks can run alongside anything.
- A task that failed, timed out or crashed is retried up to `maxRetries` times. A missing CLI
  or a permission error is not retried.
- The result lists each task's status and changes. For tasks that ran in parallel, it only
  lists the files that task declared or said it edited. The result ends with the combined
  workspace changes for the whole batch.

The plain `delegate` tool is also available in orchestrator mode, for single tasks.

### Supported agents

| Agent | id | Capabilities |
|---|---|---|
| Claude Code | `claude-code` | coding, terminal (with approval), filesystem, autonomous |

Other CLIs (Codex CLI, Gemini CLI, Aider, OpenCode, ...) fit the same interface: implement
`AgentProvider` (`src/agents/types.ts`) and add it to `src/agents/registry.ts`. Each agent
declares its capabilities, aliases and a `detect()`/`run()` pair; `createClaudeCode()` in
`src/agents/claudeCode.ts` is the reference implementation.

### Limitations

- Agents run in the same working tree, with no worktree isolation. Parallel tasks are only
  safe when their `files` are declared accurately.
- You see a delegated run as one running tool call. Progress inside the agent isn't streamed;
  the full output is shown under `ctrl+o` once it finishes.
- Change tracking needs git. Outside a repository, the model has to read files to check what
  happened.
- The orchestrator's plan is only as good as the TOOLCODE model writing it. A very weak model
  may still delegate poorly, but asking for delegation explicitly always works.

## Configuration

Settings live in `~/.toolcode/config.json`, or in the file named by `TOOLCODE_CONFIG_FILE`.
Every key is optional:

```json
{
  "agents": {
    "claude-code": {
      "enabled": true,
      "command": "C:\\Users\\me\\.local\\bin\\claude.exe",
      "timeoutMinutes": 20,
      "defaultMode": "implement",
      "commands": "ask",
      "model": "sonnet"
    }
  },
  "orchestrator": {
    "enabled": false,
    "maxParallel": 3,
    "maxRetries": 1
  },
  "maxDepth": 1
}
```

| Key | Default | Meaning |
|---|---|---|
| `agents.<id>.enabled` | `true` | `false` hides the agent; with no agents left, the delegation tools disappear |
| `agents.<id>.command` | found on PATH | Executable to run; a wrong path is reported, never silently replaced |
| `agents.<id>.timeoutMinutes` | `20` | The run is killed (with its child processes) after this long |
| `agents.<id>.defaultMode` | `implement` | Used when the model doesn't pick `implement` or `investigate` |
| `agents.<id>.commands` | `ask` | `ask` each time, always `allow`, or always `deny` shell commands |
| `agents.<id>.model` | Claude Code's default | Passed as `--model` |
| `orchestrator.enabled` | `false` | Start in orchestrator mode |
| `orchestrator.maxParallel` | `3` | Tasks running at once in a batch (1 to 8) |
| `orchestrator.maxRetries` | `1` | Extra attempts per failed task (0 to 3) |
| `maxDepth` | `1` | Delegation nesting limit (see Recursion) |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/agents` says `not installed` | Install Claude Code, or set `agents.claude-code.command` to the full path of `claude` / `claude.exe` |
| `The configured command ... was not found` | The `command` path in the config is wrong |
| Status `failure` with "not signed in" | Run `claude` once in a terminal and log in |
| `permission_denied: Bash: ...` in a result | The agent wanted a command it wasn't allowed. Allow commands when asked, or set `"commands": "allow"` |
| Status `timeout` | Raise `timeoutMinutes`, or split the task |
| `files_changed: unavailable` | The workspace isn't a git repository |
| No delegation tools at all | You said "do it yourself", the agent is disabled, or TOOLCODE is running inside a delegated agent (`TOOLCODE_DELEGATION_DEPTH`) |
| Windows: npm-installed `claude.cmd` | Supported; TOOLCODE starts `.cmd` shims through the shell and only passes fixed flags on the command line (the task goes in on stdin) |
