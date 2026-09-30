'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildRecord } = require('../hook/session-map');

const input = { session_id: 'sid', cwd: '/w', source: 'startup' };

test('plain claude in a shell → keyed by its parent', () => {
  const r = buildRecord(input, {}, { claudePid: 30, parentPid: 20 }, 'now');
  assert.deepStrictEqual(r, { sessionId: 'sid', cwd: '/w', claudePid: 30, shellPid: 20, launcherPid: null, bot: null, updatedAt: 'now' });
});

test('started by our launcher → keyed by the shell from env, bot recorded', () => {
  const env = { HANDOFF_SHELL_PID: '20', HANDOFF_LAUNCHER_PID: '21', HANDOFF_BOT: 'telegram-a' };
  const r = buildRecord(input, env, { claudePid: 22, parentPid: 21 }, 'now');
  assert.strictEqual(r.shellPid, 20);
  assert.strictEqual(r.launcherPid, 21);
  assert.strictEqual(r.bot, 'telegram-a');
  assert.strictEqual(r.claudePid, 22);
});

test('nested claude that inherited HANDOFF env is NOT treated as the tab session', () => {
  const env = { HANDOFF_SHELL_PID: '20', HANDOFF_LAUNCHER_PID: '21', HANDOFF_BOT: 'telegram-a' };
  const r = buildRecord(input, env, { claudePid: 90, parentPid: 88 }, 'now');
  assert.strictEqual(r.shellPid, 88);
  assert.strictEqual(r.bot, null);
  assert.strictEqual(r.launcherPid, null);
});

test('missing session id or claude → null', () => {
  assert.strictEqual(buildRecord({}, {}, { claudePid: 30, parentPid: 20 }, 'now'), null);
  assert.strictEqual(buildRecord(input, {}, null, 'now'), null);
  assert.strictEqual(buildRecord(input, {}, { claudePid: 30, parentPid: null }, 'now'), null);
});
