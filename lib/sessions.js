'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dataDir, readJson } = require('./config');
const { isAlive, findProc, isDescendant } = require('./proc');

function sessionsDir(home = os.homedir()) {
  return path.join(dataDir(home), 'sessions');
}

function writeSession(dir, rec) {
  fs.mkdirSync(dir, { recursive: true });
  const final = path.join(dir, `${rec.shellPid}.json`);
  const tmp = `${final}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
  fs.renameSync(tmp, final);
}

function readSession(dir, shellPid) {
  try { return readJson(path.join(dir, `${shellPid}.json`)); } catch { return null; }
}

function pruneSessions(dir, alive = isAlive) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const name of names) {
    const m = name.match(/^(\d+)\.json$/);
    if (m && !alive(Number(m[1]))) {
      try { fs.unlinkSync(path.join(dir, name)); } catch {}
    }
  }
}

function resolveTabSession(dir, shellPid, snap) {
  const session = readSession(dir, shellPid);
  if (!session) return { ok: false, reason: 'no-session' };
  const running = findProc(snap, session.claudePid) && isDescendant(snap, session.claudePid, shellPid);
  if (!running) return { ok: false, reason: 'claude-not-running' };
  return { ok: true, session };
}

module.exports = { sessionsDir, writeSession, readSession, pruneSessions, resolveTabSession };
