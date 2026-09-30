#!/usr/bin/env node
'use strict';
// Claude Code SessionStart hook: remember which session runs in which terminal shell.
// Must never disturb the session — all errors are swallowed and nothing is printed.
const path = require('path');
const lib = path.join(__dirname, '..', 'lib');

function buildRecord(input, env, located, now) {
  if (!located || !input || !input.session_id) return null;
  const launcherPid = Number(env.HANDOFF_LAUNCHER_PID) || null;
  const viaLauncher = launcherPid !== null && launcherPid === located.parentPid;
  const shellPid = viaLauncher ? Number(env.HANDOFF_SHELL_PID) || null : located.parentPid;
  if (!shellPid) return null;
  return {
    sessionId: input.session_id,
    cwd: input.cwd || null,
    claudePid: located.claudePid,
    shellPid,
    launcherPid: viaLauncher ? launcherPid : null,
    bot: viaLauncher ? env.HANDOFF_BOT || null : null,
    updatedAt: now,
  };
}

function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function main() {
  try {
    const { snapshot, locateClaude } = require(path.join(lib, 'proc'));
    const { sessionsDir, writeSession, pruneSessions } = require(path.join(lib, 'sessions'));
    const input = JSON.parse((await readStdin()) || '{}');
    const rec = buildRecord(input, process.env, locateClaude(snapshot(), process.pid), new Date().toISOString());
    if (rec) {
      const dir = sessionsDir();
      pruneSessions(dir);
      writeSession(dir, rec);
    }
  } catch {}
  process.exit(0);
}

if (require.main === module) main();

module.exports = { buildRecord };
