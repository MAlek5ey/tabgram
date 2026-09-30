'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../lib/config');

function tmpHome() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cth-home-')); }

test('loadConfig defaults when no config file', () => {
  const home = tmpHome();
  const c = config.loadConfig(home);
  assert.strictEqual(c.channelsDir, path.join(home, '.claude', 'channels'));
  assert.deepStrictEqual(c.bots, {});
  assert.deepStrictEqual(c.extraArgs, []);
  assert.strictEqual(c.claudeCommand, 'claude');
  assert.strictEqual(c.exitTimeoutMs, 15000);
  assert.strictEqual(c.permissionMode, null);
});

test('loadConfig merges user config written with a BOM', () => {
  const home = tmpHome();
  fs.mkdirSync(config.dataDir(home), { recursive: true });
  fs.writeFileSync(path.join(config.dataDir(home), 'config.json'),
    '﻿' + JSON.stringify({ permissionMode: 'auto', bots: { 'telegram-a': { label: 'A' } } }));
  const c = config.loadConfig(home);
  assert.strictEqual(c.permissionMode, 'auto');
  assert.deepStrictEqual(c.bots, { 'telegram-a': { label: 'A' } });
  assert.strictEqual(c.exitTimeoutMs, 15000);
});

test('loadConfig ignores an unparsable config file', () => {
  const home = tmpHome();
  fs.mkdirSync(config.dataDir(home), { recursive: true });
  fs.writeFileSync(path.join(config.dataDir(home), 'config.json'), '{oops');
  assert.strictEqual(config.loadConfig(home).claudeCommand, 'claude');
});

test('loadInstallInfo returns null when missing', () => {
  assert.strictEqual(config.loadInstallInfo(tmpHome()), null);
});

test('loadConfig falls back to defaults for values of the wrong type', () => {
  const home = tmpHome();
  fs.mkdirSync(config.dataDir(home), { recursive: true });
  fs.writeFileSync(path.join(config.dataDir(home), 'config.json'),
    JSON.stringify({ exitTimeoutMs: '15000', terminalReplies: 'yes', claudeCommand: 5 }));
  const c = config.loadConfig(home);
  assert.strictEqual(c.exitTimeoutMs, 15000);
  assert.strictEqual(c.terminalReplies, 'off');
  assert.strictEqual(c.claudeCommand, 'claude');
});
