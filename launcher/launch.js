#!/usr/bin/env node
'use strict';
// Restart Claude Code for a given session, optionally with a Telegram bot channel attached.
//   node launch.js --resume <session-id> [--bot <state-dir>]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const lib = path.join(__dirname, '..', 'lib');
const { loadConfig } = require(path.join(lib, 'config'));
const { snapshot } = require(path.join(lib, 'proc'));
const { findDuplicatePollers } = require(path.join(lib, 'bots'));
const { parseArgs, buildInvocation, spawnSpec } = require(path.join(lib, 'launch-args'));
const { clearPluginFailure, TELEGRAM_SERVER } = require(path.join(lib, 'mcp-cache'));
const { readTaskTitle } = require(path.join(lib, 'task-title'));
const { notifyConnected } = require(path.join(lib, 'notify'));

function fail(msg, resume) {
  console.error(`tabgram: ${msg}`);
  if (resume) console.error(`tabgram: resume manually with: claude --resume ${resume}`);
  process.exit(1);
}

let opts;
try { opts = parseArgs(process.argv.slice(2)); } catch (e) { fail(e.message); }
const cfg = loadConfig();

if (opts.bot) {
  if (!fs.existsSync(path.join(opts.bot, '.env'))) fail(`no .env in ${opts.bot}`, opts.resume);
  try {
    for (const pid of findDuplicatePollers(cfg.channelsDir, opts.bot, snapshot())) {
      try { process.kill(pid); console.error(`tabgram: stopped another poller of this bot (pid ${pid})`); } catch {}
    }
  } catch {}
  try { clearPluginFailure(TELEGRAM_SERVER); } catch {}
}

function start() {
  const inv = buildInvocation(opts, cfg, process.env, { shellPid: process.ppid, launcherPid: process.pid });
  // Ctrl+C belongs to claude; the launcher must outlive it.
  process.on('SIGINT', () => {});
  const sp = spawnSpec(inv, process.platform);
  const child = spawn(sp.command, sp.args, { stdio: 'inherit', env: inv.env, shell: sp.shell });
  child.on('error', e => fail(`failed to start ${inv.command}: ${e.message}`, opts.resume));
  child.on('exit', code => {
    if (code) console.error(`tabgram: resume manually with: claude --resume ${opts.resume}`);
    process.exit(code === null ? 0 : code);
  });
}

// Tell the bot's owner which session it now belongs to. It runs alongside claude, so a slow
// Telegram never delays the restart; nothing is printed over claude's screen.
async function announce() {
  if (!opts.bot) return;
  try { await notifyConnected(opts.bot, readTaskTitle(opts.resume), cfg.connectMessage); } catch {}
}

start();
announce();
