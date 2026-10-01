/**
 * Delegated agents: other coding CLIs (Claude Code first) that TOOLCODE can hand
 * a task to. TOOLCODE stays in charge of the conversation; an agent is a worker
 * that gets one self-contained task, edits the shared workspace and reports back.
 */

/** How a delegated run ended. Only `success` means the agent finished the task. */
export type AgentStatus = 'success' | 'failure' | 'timeout' | 'not_installed' | 'permission_error' | 'unknown_error';

/** What an agent can do, so the orchestrator can pick one that fits a task. */
export interface AgentCapabilities {
	/** Writes and edits code. */
	coding: boolean;
	/** Runs shell commands such as tests and builds. */
	terminal: boolean;
	/** Reads and writes the workspace directly. */
	filesystem: boolean;
	/** Works through a multi-step task without supervision. */
	autonomous: boolean;
}

/** `investigate` agents look but never change files; `implement` agents edit the workspace. */
export type AgentMode = 'implement' | 'investigate';

export interface AgentRequest {
	/** The complete task prompt (see buildTaskPrompt). */
	prompt: string;
	/** Directory the agent runs in. */
	cwd: string;
	mode: AgentMode;
	/** Whether the agent may run shell commands. Never granted silently; see the delegate tool. */
	allowCommands: boolean;
	timeoutMs: number;
	signal: AbortSignal;
}

export interface AgentRunResult {
	status: AgentStatus;
	/** Null when the process never started or was killed. */
	exitCode: number | null;
	stdout: string;
	stderr: string;
	/** The agent's own account of what it did; undefined when it gave none. */
	summary?: string;
	/** Shell commands the agent reports running, when its output says. */
	commandsRun?: string[];
	/** Files the agent reports editing, when its output says. The workspace is the source of truth. */
	filesTouched?: string[];
	/** Actions the agent wanted but was not allowed, e.g. a command without allow_commands. */
	permissionDenials?: string[];
	turns?: number;
	costUsd?: number;
}

export interface AgentDetection {
	available: boolean;
	/** The executable that would run. */
	command?: string;
	version?: string;
	/** Why the agent is unavailable, written for the user. */
	reason?: string;
}

/**
 * An external coding CLI. Adding another one (Codex, Gemini CLI, Aider...) means
 * implementing this interface and registering it in `src/agents/registry.ts`.
 */
export interface AgentProvider {
	/** Stable id used in config and tool arguments, e.g. "claude-code". */
	id: string;
	/** Display name, e.g. "Claude Code". */
	name: string;
	/** One line on what the agent is good at, shown to the model. */
	description: string;
	/** Lowercase phrases a user might name it by, e.g. ["claude code"]. */
	aliases: string[];
	capabilities: AgentCapabilities;
	detect(): Promise<AgentDetection>;
	run(request: AgentRequest): Promise<AgentRunResult>;
}
