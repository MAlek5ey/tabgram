'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Installed layout: lib/ next to extension.js. Repo layout: lib/ one level up.
const ROOT = fs.existsSync(path.join(__dirname, 'lib')) ? __dirname : path.join(__dirname, '..');
const { snapshotAsync, isAlive, findProc, shellKind } = require(path.join(ROOT, 'lib', 'proc'));
const { loadConfig, loadInstallInfo } = require(path.join(ROOT, 'lib', 'config'));
const { discoverBots, botLabel } = require(path.join(ROOT, 'lib', 'bots'));
const { sessionsDir, readSession, resolveTabSession } = require(path.join(ROOT, 'lib', 'sessions'));
const { buildCommandLine } = require(path.join(ROOT, 'lib', 'cmdline'));
const { clearInputKeys, readEditorMode, timeoutMessage, createInFlight } = require(path.join(ROOT, 'lib', 'handoff'));
const LAUNCHER = path.join(ROOT, 'launcher', 'launch.js');
const COMMANDS = ['tabgram.connect', 'tabgram.disconnect'];

const MSG = {
  noClaude: 'Claude Code is not running in the active terminal tab (was it started before Tabgram was installed? Restart it once).',
  noBots: 'No Telegram bots found. Each bot needs its own folder ~/.claude/channels/telegram-<name>/ with a .env — see the README.',
  busy: 'This bot is already attached to another session.',
  busyIn: dir => `This bot is being polled by a session started without Tabgram (folder ${dir}/). Close that session first.`,
  sameTab: 'This bot is already attached to this tab.',
  skipShell: 'Tabgram added its commands to terminal.integrated.commandsToSkipShell in your user settings, so its hotkeys work inside the terminal.',
  notConnected: 'No Telegram bot is attached to this tab.',
  inProgress: 'Tabgram is already restarting this tab.',
};

let statusItem;
const inFlight = createInFlight();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function activeTab() {
  const terminal = vscode.window.activeTerminal;
  if (!terminal) return null;
  const shellPid = await terminal.processId;
  return shellPid ? { terminal, shellPid } : null;
}

async function waitExit(pids, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (pids.every(p => !p || !isAlive(p))) return true;
    await sleep(300);
  }
  return false;
}

async function restart(tab, session, snap, cfg, botStateDir) {
  const kind = shellKind((findProc(snap, tab.shellPid) || {}).name);
  const info = loadInstallInfo();
  const runtime = cfg.runtime || (info && info.runtime) || 'node';
  tab.terminal.show();
  for (const key of clearInputKeys(readEditorMode())) {
    tab.terminal.sendText(key, false);
    await sleep(150);
  }
  tab.terminal.sendText('/exit', true);
  if (!(await waitExit([session.claudePid, session.launcherPid], cfg.exitTimeoutMs))) {
    vscode.window.showErrorMessage(timeoutMessage(session.sessionId));
    return;
  }
  const argv = [runtime, LAUNCHER, '--resume', session.sessionId];
  if (botStateDir) argv.push('--bot', botStateDir);
  tab.terminal.sendText(buildCommandLine(kind, argv), true);
  setTimeout(refreshStatus, 5000);
}

async function prepare() {
  const cfg = loadConfig();
  const tab = await activeTab();
  if (!tab) { vscode.window.showErrorMessage(MSG.noClaude); return null; }
  const snap = await snapshotAsync();
  const r = resolveTabSession(sessionsDir(), tab.shellPid, snap);
  if (!r.ok) { vscode.window.showErrorMessage(MSG.noClaude); return null; }
  return { cfg, tab, snap, session: r.session };
}

async function connect() {
  const ctx = await prepare();
  if (!ctx) return;
  const bots = discoverBots(ctx.cfg.channelsDir, ctx.snap, ctx.cfg.bots);
  if (!bots.length) { vscode.window.showErrorMessage(MSG.noBots); return; }
  const mine = b => b.id === ctx.session.bot;
  const pick = await vscode.window.showQuickPick(
    bots.map(b => mine(b)
      ? { label: `📱 ${b.label}`, description: 'this tab', bot: b }
      : { label: `${b.busy ? '🔴' : '🟢'} ${b.label}`, description: b.busy ? 'busy' : 'free', bot: b }),
    { placeHolder: 'Telegram bot for this Claude Code tab' });
  if (!pick) return;
  if (mine(pick.bot)) { vscode.window.showInformationMessage(MSG.sameTab); return; }
  if (pick.bot.busyIn) { vscode.window.showWarningMessage(MSG.busyIn(pick.bot.busyIn)); return; }
  if (pick.bot.busy) { vscode.window.showWarningMessage(MSG.busy); return; }
  await exclusive(ctx, () => restart(ctx.tab, ctx.session, ctx.snap, ctx.cfg, pick.bot.stateDir));
}

async function disconnect() {
  const ctx = await prepare();
  if (!ctx) return;
  if (!ctx.session.bot) { vscode.window.showInformationMessage(MSG.notConnected); return; }
  await exclusive(ctx, () => restart(ctx.tab, ctx.session, ctx.snap, ctx.cfg, null));
}

// One handoff per tab at a time: a second press would type a launcher line into the resumed claude.
async function exclusive(ctx, fn) {
  if (!inFlight.enter(ctx.tab.shellPid)) { vscode.window.showWarningMessage(MSG.inProgress); return; }
  try { await fn(); } finally { inFlight.leave(ctx.tab.shellPid); }
}

async function refreshStatus() {
  try {
    const tab = await activeTab();
    const s = tab && readSession(sessionsDir(), tab.shellPid);
    if (s && s.bot && isAlive(s.claudePid)) {
      statusItem.text = `📱 ${botLabel(s.bot, loadConfig().bots)}`;
      statusItem.tooltip = 'Telegram bot attached to this Claude Code tab — click to disconnect';
      statusItem.show();
    } else {
      statusItem.hide();
    }
  } catch { statusItem.hide(); }
}

// Without this the integrated terminal sends our hotkeys to the shell instead of VS Code.
async function ensureSkipShell() {
  const conf = vscode.workspace.getConfiguration('terminal.integrated');
  const list = conf.get('commandsToSkipShell') || [];
  const missing = COMMANDS.filter(c => !list.includes(c));
  if (!missing.length) return;
  await conf.update('commandsToSkipShell', [...list, ...missing], vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(MSG.skipShell);
}

// The hook writes the tab's session file when claude starts (in the background), so follow the folder.
function watchSessions() {
  let timer;
  try {
    fs.mkdirSync(sessionsDir(), { recursive: true });
    const w = fs.watch(sessionsDir(), () => { clearTimeout(timer); timer = setTimeout(refreshStatus, 500); });
    w.on('error', () => {});
    return { dispose: () => { clearTimeout(timer); w.close(); } };
  } catch { return { dispose() {} }; }
}

function guard(fn) {
  return async () => {
    try { await fn(); } catch (e) { vscode.window.showErrorMessage(`Tabgram: ${e.message}`); }
  };
}

function activate(context) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = 'tabgram.disconnect';
  context.subscriptions.push(
    statusItem,
    vscode.commands.registerCommand('tabgram.connect', guard(connect)),
    vscode.commands.registerCommand('tabgram.disconnect', guard(disconnect)),
    vscode.window.onDidChangeActiveTerminal(() => refreshStatus()),
    vscode.window.onDidCloseTerminal(() => refreshStatus()),
    watchSessions(),
  );
  ensureSkipShell().catch(() => {});
  refreshStatus();
}

function deactivate() {}

module.exports = { activate, deactivate };
