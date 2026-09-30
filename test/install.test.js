'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const install = require('../install');
const uninstall = require('../uninstall');

function env() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-inst-'));
  const extensionsDir = path.join(home, '.vscode', 'extensions');
  return { home, extensionsDir, execPath: 'C:\\node\\node.exe', log: () => {} };
}

test('install copies extension + lib, registers hook, writes install.json; idempotent', () => {
  const e = env();
  const settingsFile = path.join(e.home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify({ model: 'x' }));
  const { target } = install.main(e);
  install.main(e);
  for (const f of ['package.json', 'extension.js', 'lib/proc.js', 'hook/session-map.js', 'hook/turn-reply.js', 'launcher/launch.js']) {
    assert.ok(fs.existsSync(path.join(target, f)), f);
  }
  const s = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.strictEqual(s.model, 'x');
  assert.strictEqual(s.hooks.SessionStart.length, 1);
  assert.match(s.hooks.Stop[0].hooks[0].command, /turn-reply\.js/);
  // The backup keeps the settings from before the first install; reinstalls don't overwrite it.
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(settingsFile + '.tabgram.bak', 'utf8')), { model: 'x' });
  const info = JSON.parse(fs.readFileSync(path.join(e.home, '.claude', 'tabgram', 'install.json'), 'utf8'));
  assert.strictEqual(info.runtime, 'C:\\node\\node.exe');
  assert.strictEqual(info.root, target);
});

test('install removes the extension installed under the old name', () => {
  const e = env();
  const old = path.join(e.extensionsDir, 'local.claude-telegram-handoff-0.1.0');
  fs.mkdirSync(old, { recursive: true });
  const { target } = install.main(e);
  assert.ok(!fs.existsSync(old));
  assert.match(path.basename(target), /^local\.tabgram-/);
});

test('install refuses to overwrite an unparsable settings.json', () => {
  const e = env();
  const settingsFile = path.join(e.home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, '{broken');
  assert.throws(() => install.main(e), /settings\.json/);
  assert.strictEqual(fs.readFileSync(settingsFile, 'utf8'), '{broken');
});

test('install moves data and backup left by earlier versions under the handoff name', () => {
  const e = env();
  const claudeDir = path.join(e.home, '.claude');
  fs.mkdirSync(path.join(claudeDir, 'handoff'), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'handoff', 'config.json'), '{"terminalReplies":"full"}');
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{"model":"new"}');
  fs.writeFileSync(path.join(claudeDir, 'settings.json.handoff.bak'), '{"model":"original"}');
  install.main(e);
  assert.ok(!fs.existsSync(path.join(claudeDir, 'handoff')));
  assert.strictEqual(fs.readFileSync(path.join(claudeDir, 'tabgram', 'config.json'), 'utf8'), '{"terminalReplies":"full"}');
  assert.ok(!fs.existsSync(path.join(claudeDir, 'settings.json.handoff.bak')));
  assert.strictEqual(fs.readFileSync(path.join(claudeDir, 'settings.json.tabgram.bak'), 'utf8'), '{"model":"original"}');
});

test('install leaves the old data dir alone when the new one already exists', () => {
  const e = env();
  const claudeDir = path.join(e.home, '.claude');
  fs.mkdirSync(path.join(claudeDir, 'handoff'), { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'tabgram'), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'tabgram', 'config.json'), '{}');
  install.main(e);
  assert.ok(fs.existsSync(path.join(claudeDir, 'handoff')));
  assert.strictEqual(fs.readFileSync(path.join(claudeDir, 'tabgram', 'config.json'), 'utf8'), '{}');
});

test('uninstall removes extension dir and hook, keeps data dir unless purge', () => {
  const e = env();
  const { target } = install.main(e);
  uninstall.main({ ...e, purge: false, useCodeCli: false });
  assert.ok(!fs.existsSync(target));
  const s = JSON.parse(fs.readFileSync(path.join(e.home, '.claude', 'settings.json'), 'utf8'));
  assert.deepStrictEqual(s, {});
  assert.ok(fs.existsSync(path.join(e.home, '.claude', 'tabgram')));
  uninstall.main({ ...e, purge: true, useCodeCli: false });
  assert.ok(!fs.existsSync(path.join(e.home, '.claude', 'tabgram')));
});

test('uninstall with an unparsable settings.json changes nothing', () => {
  const e = env();
  const { target } = install.main(e);
  const settingsFile = path.join(e.home, '.claude', 'settings.json');
  fs.writeFileSync(settingsFile, '{broken');
  assert.throws(() => uninstall.main({ ...e, purge: true, useCodeCli: false }), /settings\.json/);
  assert.ok(fs.existsSync(target));
  assert.ok(fs.existsSync(path.join(e.home, '.claude', 'tabgram')));
  assert.strictEqual(fs.readFileSync(settingsFile, 'utf8'), '{broken');
});

test('moveIfFree copies when the rename is refused (the old extension still watches the folder)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-mv-'));
  const from = path.join(home, 'handoff');
  const to = path.join(home, 'tabgram');
  fs.mkdirSync(path.join(from, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(from, 'config.json'), '{"a":1}');
  const refuse = () => { const e = new Error('busy'); e.code = 'EPERM'; throw e; };
  install.moveIfFree(from, to, refuse);
  assert.strictEqual(fs.readFileSync(path.join(to, 'config.json'), 'utf8'), '{"a":1}');
});
