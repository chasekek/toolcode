import * as path from 'node:path';
import * as vscode from 'vscode';
import {fileReference, launchFor, type LaunchSettings} from './launch.js';

const API_KEY_SECRET = 'toolcode.openRouterApiKey';
const TERMINAL_NAME = 'TOOLCODE';
// A fresh terminal needs a moment before Ink reads keys; text sent earlier can be dropped.
const STARTUP_MS = 1500;

let current: vscode.Terminal | undefined;

export function activate(context: vscode.ExtensionContext) {
	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	status.text = '$(tools) TOOLCODE';
	status.tooltip = 'Open TOOLCODE';
	status.command = 'toolcode.open';
	status.show();

	// The sidebar view stays empty on purpose: its welcome content (package.json) holds the buttons.
	const home: vscode.TreeDataProvider<never> = {getTreeItem: item => item, getChildren: () => []};

	context.subscriptions.push(
		status,
		vscode.window.registerTreeDataProvider('toolcode.home', home),
		vscode.commands.registerCommand('toolcode.open', () => open(context, {reuse: true})),
		vscode.commands.registerCommand('toolcode.openNew', () => open(context, {reuse: false})),
		vscode.commands.registerCommand('toolcode.openOrchestrator', () => open(context, {reuse: false, orchestrator: true})),
		vscode.commands.registerCommand('toolcode.addReference', (uri?: vscode.Uri) => addReference(context, uri)),
		vscode.commands.registerCommand('toolcode.setApiKey', () => setApiKey(context)),
		vscode.commands.registerCommand('toolcode.clearApiKey', async () => {
			await context.secrets.delete(API_KEY_SECRET);
			vscode.window.showInformationMessage('TOOLCODE: OpenRouter API key cleared. New sessions use your environment or /auth.');
		}),
		vscode.window.onDidCloseTerminal(terminal => {
			if (terminal === current) current = undefined;
		}),
	);
}

export function deactivate() {}

interface OpenOptions {
	/** Show the running session instead of starting another one. */
	reuse: boolean;
	orchestrator?: boolean;
}

/** Shows the TOOLCODE terminal, starting it first if needed. Resolves to the terminal and whether it is new. */
async function open(context: vscode.ExtensionContext, options: OpenOptions): Promise<{terminal: vscode.Terminal; fresh: boolean} | undefined> {
	if (options.reuse && current && current.exitStatus === undefined) {
		current.show();
		return {terminal: current, fresh: false};
	}

	const cwd = workspaceFolder()?.uri.fsPath;
	if (!cwd) {
		vscode.window.showErrorMessage('TOOLCODE needs an open folder: it works inside the workspace root.');
		return undefined;
	}

	const config = vscode.workspace.getConfiguration('toolcode');
	const settings: LaunchSettings = {
		path: config.get('path', 'toolcode'),
		ascii: config.get('ascii', false),
		mouse: config.get('mouse', true),
		orchestrator: options.orchestrator || config.get('orchestrator', false),
		plugins: config.get<string[]>('plugins', []),
		loadUserPlugins: config.get('loadUserPlugins', true),
	};
	const {shellPath, shellArgs} = launchFor(settings, cwd);

	const env: Record<string, string> = {...config.get<Record<string, string>>('env', {})};
	const apiKey = await context.secrets.get(API_KEY_SECRET);
	if (apiKey) env['OPENROUTER_API_KEY'] = apiKey;

	const terminal = vscode.window.createTerminal({
		name: TERMINAL_NAME,
		shellPath,
		shellArgs,
		cwd,
		env,
		iconPath: new vscode.ThemeIcon('tools'),
		location: config.get('location', 'editor') === 'editor' ? {viewColumn: vscode.ViewColumn.Beside} : vscode.TerminalLocation.Panel,
	});
	terminal.show();
	current = terminal;
	return {terminal, fresh: true};
}

/** The folder of the active file, else the first workspace folder. */
function workspaceFolder(): vscode.WorkspaceFolder | undefined {
	const active = vscode.window.activeTextEditor?.document.uri;
	return (active && vscode.workspace.getWorkspaceFolder(active)) || vscode.workspace.workspaceFolders?.[0];
}

/**
 * Types a reference to a file (from the explorer) or to the active editor's
 * selection into the TOOLCODE prompt, without submitting it.
 */
async function addReference(context: vscode.ExtensionContext, uri?: vscode.Uri) {
	const editor = vscode.window.activeTextEditor;
	const target = uri ?? editor?.document.uri;
	if (!target || target.scheme !== 'file') {
		vscode.window.showWarningMessage('TOOLCODE: open a file on disk to reference it.');
		return;
	}

	let start: number | undefined;
	let end: number | undefined;
	// Only the editor's own file has a selection worth sending; an explorer click names the whole file.
	if (editor && editor.document.uri.toString() === target.toString() && !editor.selection.isEmpty) {
		const {selection} = editor;
		start = selection.start.line + 1;
		// A selection ending at column 0 stops before that line.
		end = selection.end.character === 0 && selection.end.line > selection.start.line ? selection.end.line : selection.end.line + 1;
	}

	const session = await open(context, {reuse: true});
	if (!session) return;
	const cwd = session.terminal.creationOptions && 'cwd' in session.terminal.creationOptions ? session.terminal.creationOptions.cwd : undefined;
	const root = typeof cwd === 'string' ? cwd : cwd?.fsPath ?? workspaceFolder()?.uri.fsPath ?? '';
	const relative = path.relative(root, target.fsPath);
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
		vscode.window.showWarningMessage('TOOLCODE: that file is outside the session\'s workspace, which TOOLCODE cannot read.');
		return;
	}

	if (session.fresh) await new Promise(resolve => setTimeout(resolve, STARTUP_MS));
	session.terminal.sendText(fileReference(relative, start, end), false);
}

async function setApiKey(context: vscode.ExtensionContext) {
	const key = await vscode.window.showInputBox({
		title: 'OpenRouter API key',
		prompt: 'Stored in VS Code\'s secret storage and passed to new TOOLCODE sessions as OPENROUTER_API_KEY.',
		password: true,
		ignoreFocusOut: true,
	});
	if (!key?.trim()) return;
	await context.secrets.store(API_KEY_SECRET, key.trim());
	vscode.window.showInformationMessage('TOOLCODE: API key saved. It applies to sessions started from now on.');
}
