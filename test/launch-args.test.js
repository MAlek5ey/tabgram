'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseArgs, buildInvocation, spawnSpec, CHANNEL } = require('../lib/launch-args');

const cfg = { permissionMode: null, extraArgs: [], claudeCommand: 'claude' };
const ids = { shellPid: 20, launcherPid: 21 };

test('parseArgs', () => {
  assert.deepStrictEqual(parseArgs(['--resume', 'abc']), { resume: 'abc', bot: null });
  assert.deepStrictEqual(parseArgs(['--bot', '/c/telegram-a', '--resume', 'abc']), { resume: 'abc', bot: '/c/telegram-a' });
  assert.throws(() => parseArgs([]), /--resume/);
  assert.throws(() => parseArgs(['--resume', 'a', '--x']), /unknown argument/);
});

test('with bot: channels flag, state dir, handoff env', () => {
  const inv = buildInvocation({ resume: 'abc', bot: '/c/telegram-a' }, cfg, { PATH: 'p' }, ids);
  assert.strictEqual(inv.command, 'claude');
  assert.deepStrictEqual(inv.args, ['--resume', 'abc', '--channels', CHANNEL]);
  assert.strictEqual(inv.env.TELEGRAM_STATE_DIR, '/c/telegram-a');
  assert.strictEqual(inv.env.HANDOFF_BOT, 'telegram-a');
  assert.strictEqual(inv.env.HANDOFF_SHELL_PID, '20');
  assert.strictEqual(inv.env.HANDOFF_LAUNCHER_PID, '21');
  assert.strictEqual(inv.env.PATH, 'p');
});

test('without bot: inherited TELEGRAM_STATE_DIR and HANDOFF_BOT removed', () => {
  const inv = buildInvocation({ resume: 'abc', bot: null }, cfg, { TELEGRAM_STATE_DIR: 'x', HANDOFF_BOT: 'y' }, ids);
  assert.deepStrictEqual(inv.args, ['--resume', 'abc']);
  assert.ok(!('TELEGRAM_STATE_DIR' in inv.env));
  assert.ok(!('HANDOFF_BOT' in inv.env));
});

test('permissionMode, extraArgs and claudeCommand from config', () => {
  const c = { permissionMode: 'auto', extraArgs: ['--model', 'opus'], claudeCommand: 'claude-dev' };
  const inv = buildInvocation({ resume: 'abc', bot: null }, c, {}, ids);
  assert.strictEqual(inv.command, 'claude-dev');
  assert.deepStrictEqual(inv.args, ['--resume', 'abc', '--permission-mode', 'auto', '--model', 'opus']);
});

// Node 24 warns (DEP0190) when an args array is passed together with shell:true.
test('spawnSpec on win32: one command string through the shell, no args array', () => {
  const s = spawnSpec({ command: 'claude', args: ['--resume', 'abc', '--channels', CHANNEL] }, 'win32');
  assert.strictEqual(s.command, `claude --resume abc --channels ${CHANNEL}`);
  assert.deepStrictEqual(s.args, []);
  assert.strictEqual(s.shell, true);
});

test('spawnSpec elsewhere: args array, no shell', () => {
  const s = spawnSpec({ command: 'claude', args: ['--resume', 'abc'] }, 'linux');
  assert.strictEqual(s.command, 'claude');
  assert.deepStrictEqual(s.args, ['--resume', 'abc']);
  assert.strictEqual(s.shell, false);
});

test('spawnSpec on win32 quotes a command and args that contain spaces or shell characters', () => {
  const s = spawnSpec({ command: 'C:/Program Files/c/claude.cmd', args: ['--resume', 'abc', '--model', 'a&b'] }, 'win32');
  assert.strictEqual(s.command, '"C:/Program Files/c/claude.cmd" --resume abc --model "a&b"');
});
