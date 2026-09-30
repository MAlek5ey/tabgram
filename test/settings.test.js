'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const st = require('../lib/settings');

const CMD = st.hookCommand('C:\\Program Files\\nodejs\\node.exe', 'C:\\Users\\u\\.vscode\\extensions\\local.tabgram-0.1.0\\hook\\session-map.js');
const foreign = { matcher: 'startup', hooks: [{ type: 'command', command: 'echo hi' }] };

test('hookCommand quotes and uses forward slashes', () => {
  assert.strictEqual(CMD, '"C:/Program Files/nodejs/node.exe" "C:/Users/u/.vscode/extensions/local.tabgram-0.1.0/hook/session-map.js"');
});

test('removeHook also takes out hooks installed under the old name', () => {
  const old = CMD.replace('local.tabgram-0.1.0', 'local.claude-telegram-handoff-0.1.0');
  const s = { hooks: { SessionStart: [foreign, { hooks: [{ type: 'command', command: old }] }] } };
  assert.deepStrictEqual(st.removeHook(s), { hooks: { SessionStart: [foreign] } });
});

const STOP = CMD.replace('session-map.js', 'turn-reply.js');
const ours = command => ({ hooks: [{ type: 'command', command, async: true }] });

test('addHook to empty settings registers a background hook', () => {
  assert.deepStrictEqual(st.addHook({}, CMD), { hooks: { SessionStart: [ours(CMD)] } });
});

test('addHooks registers every event and removeHook takes them all out', () => {
  const s = st.addHooks({ hooks: { Stop: [foreign] } }, { SessionStart: CMD, Stop: STOP });
  assert.deepStrictEqual(s, { hooks: { Stop: [foreign, ours(STOP)], SessionStart: [ours(CMD)] } });
  assert.deepStrictEqual(st.addHooks(s, { SessionStart: CMD, Stop: STOP }), s);
  assert.deepStrictEqual(st.removeHook(s), { hooks: { Stop: [foreign] } });
});

test('addHook keeps foreign hooks and other keys, is idempotent, replaces old version', () => {
  const base = { model: 'x', hooks: { SessionStart: [foreign], Stop: [foreign] } };
  const once = st.addHook(base, CMD);
  const twice = st.addHook(once, CMD);
  assert.deepStrictEqual(twice, once);
  assert.strictEqual(once.model, 'x');
  assert.deepStrictEqual(once.hooks.Stop, [foreign]);
  assert.deepStrictEqual(once.hooks.SessionStart[0], foreign);
  assert.strictEqual(once.hooks.SessionStart.length, 2);
  const upgraded = st.addHook(once, CMD.replace('0.1.0', '0.2.0'));
  assert.strictEqual(upgraded.hooks.SessionStart.length, 2);
  assert.match(upgraded.hooks.SessionStart[1].hooks[0].command, /0\.2\.0/);
  assert.deepStrictEqual(base.hooks.SessionStart, [foreign], 'input not mutated');
});

test('removeHook removes only ours and prunes empties', () => {
  assert.deepStrictEqual(st.removeHook(st.addHook({}, CMD)), {});
  const mixed = st.addHook({ hooks: { SessionStart: [foreign] } }, CMD);
  assert.deepStrictEqual(st.removeHook(mixed), { hooks: { SessionStart: [foreign] } });
});

test('readSettings: missing → {}, BOM ok, invalid throws', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-set-'));
  assert.deepStrictEqual(st.readSettings(path.join(dir, 'none.json')), {});
  fs.writeFileSync(path.join(dir, 'bom.json'), '\uFEFF{"a":1}');
  assert.deepStrictEqual(st.readSettings(path.join(dir, 'bom.json')), { a: 1 });
  fs.writeFileSync(path.join(dir, 'bad.json'), '{bad');
  assert.throws(() => st.readSettings(path.join(dir, 'bad.json')));
});
