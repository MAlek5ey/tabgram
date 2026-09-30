'use strict';
const path = require('path');

const CHANNEL = 'plugin:telegram@claude-plugins-official';

function parseArgs(argv) {
  const opts = { resume: null, bot: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume') opts.resume = argv[++i] || null;
    else if (a === '--bot') opts.bot = argv[++i] || null;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!opts.resume) throw new Error('--resume <session-id> is required');
  return opts;
}

function buildInvocation(opts, cfg, baseEnv, ids) {
  const args = ['--resume', opts.resume];
  const env = { ...baseEnv };
  delete env.TELEGRAM_STATE_DIR;
  delete env.HANDOFF_BOT;
  if (opts.bot) {
    args.push('--channels', CHANNEL);
    env.TELEGRAM_STATE_DIR = opts.bot;
    env.HANDOFF_BOT = path.basename(opts.bot);
  }
  if (cfg.permissionMode) args.push('--permission-mode', cfg.permissionMode);
  args.push(...(cfg.extraArgs || []));
  env.HANDOFF_SHELL_PID = String(ids.shellPid);
  env.HANDOFF_LAUNCHER_PID = String(ids.launcherPid);
  return { command: cfg.claudeCommand || 'claude', args, env };
}

// On Windows claude is a .cmd shim and needs a shell. Node 24 warns (DEP0190) about an args
// array combined with shell:true, so we join the line ourselves, quoting what cmd would split or run.
const cmdQuote = s => (/^[\w.:@\/\\=+-]+$/.test(s) ? s : `"${String(s).replace(/"/g, '""')}"`);

function spawnSpec(inv, platform) {
  if (platform === 'win32') return { command: [inv.command, ...inv.args].map(cmdQuote).join(' '), args: [], shell: true };
  return { command: inv.command, args: inv.args, shell: false };
}

module.exports = { CHANNEL, parseArgs, buildInvocation, spawnSpec };
