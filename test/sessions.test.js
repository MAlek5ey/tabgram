'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const s = require('../lib/sessions');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cth-sess-'));
const rec = (shellPid, extra = {}) => ({ sessionId: 'sid', cwd: 'c', claudePid: 30, shellPid, launcherPid: null, bot: null, updatedAt: 't', ...extra });

test('write/read roundtrip, overwrite, no tmp leftovers', () => {
  const dir = path.join(tmp(), 'nested', 'sessions');
  s.writeSession(dir, rec(20));
  s.writeSession(dir, rec(20, { sessionId: 'sid2' }));
  assert.strictEqual(s.readSession(dir, 20).sessionId, 'sid2');
  assert.deepStrictEqual(fs.readdirSync(dir), ['20.json']);
  assert.strictEqual(s.readSession(dir, 99), null);
});

test('pruneSessions removes records of dead shells only', () => {
  const dir = tmp();
  s.writeSession(dir, rec(20));
  s.writeSession(dir, rec(21));
  fs.writeFileSync(path.join(dir, 'junk.txt'), 'x');
  s.pruneSessions(dir, pid => pid === 20);
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['20.json', 'junk.txt']);
});

test('resolveTabSession', () => {
  const dir = tmp();
  const snap = [
    { pid: 20, ppid: 1, name: 'pwsh', cmd: '' },
    { pid: 30, ppid: 20, name: 'claude', cmd: '' },
    { pid: 40, ppid: 1, name: 'bash', cmd: '' },
  ];
  assert.deepStrictEqual(s.resolveTabSession(dir, 20, snap), { ok: false, reason: 'no-session' });
  s.writeSession(dir, rec(20));
  assert.strictEqual(s.resolveTabSession(dir, 20, snap).ok, true);
  s.writeSession(dir, rec(40));
  assert.deepStrictEqual(s.resolveTabSession(dir, 40, snap), { ok: false, reason: 'claude-not-running' });
  s.writeSession(dir, rec(20, { claudePid: 31 }));
  assert.deepStrictEqual(s.resolveTabSession(dir, 20, snap), { ok: false, reason: 'claude-not-running' });
});
