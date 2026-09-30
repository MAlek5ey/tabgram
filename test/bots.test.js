'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bots = require('../lib/bots');

function mkChannels(spec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-ch-'));
  for (const [name, files] of Object.entries(spec)) {
    fs.mkdirSync(path.join(dir, name));
    for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name, f), body);
  }
  return dir;
}
const poller = pid => ({ pid, ppid: 1, name: 'bun.exe', cmd: 'bun run --cwd x --silent start server.ts' });
const other = pid => ({ pid, ppid: 1, name: 'notepad.exe', cmd: 'notepad.exe' });

test('parseEnvToken handles BOM, CRLF, spaces, quotes, absence', () => {
  assert.strictEqual(bots.parseEnvToken('﻿TELEGRAM_BOT_TOKEN=123:abc\r\nX=1\r\n'), '123:abc');
  assert.strictEqual(bots.parseEnvToken('  TELEGRAM_BOT_TOKEN = "123:abc" '), '123:abc');
  assert.strictEqual(bots.parseEnvToken('OTHER=1'), null);
  assert.strictEqual(bots.parseEnvToken('TELEGRAM_BOT_TOKEN='), null);
});

test('discoverBots: only telegram-* dirs with .env, sorted, labels, hidden', () => {
  const ch = mkChannels({
    'telegram-b': { '.env': 'TELEGRAM_BOT_TOKEN=2:b' },
    'telegram-a': { '.env': 'TELEGRAM_BOT_TOKEN=1:a' },
    'telegram-noenv': {},
    'telegram-h': { '.env': 'TELEGRAM_BOT_TOKEN=3:h' },
    'telegram': { '.env': 'TELEGRAM_BOT_TOKEN=1:a' },
  });
  const list = bots.discoverBots(ch, [], { 'telegram-a': { label: 'Alpha' }, 'telegram-h': { hidden: true } });
  assert.deepStrictEqual(list.map(b => [b.id, b.label, b.busy]), [['telegram-a', 'Alpha', false], ['telegram-b', 'b', false]]);
  assert.strictEqual(list[0].stateDir, path.join(ch, 'telegram-a'));
});

test('discoverBots: busy only when bot.pid is a live server.ts poller (PID reuse → free)', () => {
  const ch = mkChannels({
    'telegram-a': { '.env': 'TELEGRAM_BOT_TOKEN=1:a', 'bot.pid': '111' },
    'telegram-b': { '.env': 'TELEGRAM_BOT_TOKEN=2:b', 'bot.pid': '222' },
    'telegram-c': { '.env': 'TELEGRAM_BOT_TOKEN=3:c', 'bot.pid': '333' },
  });
  const list = bots.discoverBots(ch, [poller(111), other(222)]);
  assert.deepStrictEqual(list.map(b => b.busy), [true, false, false]);
});

test('discoverBots: a live poller with the same token in another folder makes the bot busy there', () => {
  const ch = mkChannels({
    'telegram-a': { '.env': 'TELEGRAM_BOT_TOKEN=1:a' },
    'telegram': { '.env': 'TELEGRAM_BOT_TOKEN=1:a', 'bot.pid': '222' },
    'telegram-b': { '.env': 'TELEGRAM_BOT_TOKEN=2:b', 'bot.pid': '333' },
    'telegram-c': { '.env': 'TELEGRAM_BOT_TOKEN=3:c' },
    'telegram-old': { '.env': 'TELEGRAM_BOT_TOKEN=3:c', 'bot.pid': '444' },
  });
  const list = bots.discoverBots(ch, [poller(222), poller(333), other(444)]);
  assert.deepStrictEqual(list.map(b => [b.id, b.busy, b.busyIn]),
    [['telegram-a', true, 'telegram'], ['telegram-b', true, null], ['telegram-c', false, null], ['telegram-old', false, null]]);
});

test('discoverBots on a missing directory returns []', () => {
  assert.deepStrictEqual(bots.discoverBots(path.join(os.tmpdir(), 'cth-does-not-exist'), []), []);
});

test('botLabel strips telegram- prefix unless configured', () => {
  assert.strictEqual(bots.botLabel('telegram-x_bot'), 'x_bot');
  assert.strictEqual(bots.botLabel('telegram-x_bot', { 'telegram-x_bot': { label: 'X' } }), 'X');
});

test('findDuplicatePollers: same token elsewhere (incl. legacy telegram/) with live poller', () => {
  const ch = mkChannels({
    'telegram-a': { '.env': 'TELEGRAM_BOT_TOKEN=1:a', 'bot.pid': '111' },
    'telegram': { '.env': 'TELEGRAM_BOT_TOKEN=1:a', 'bot.pid': '222' },
    'telegram-b': { '.env': 'TELEGRAM_BOT_TOKEN=2:b', 'bot.pid': '333' },
    'telegram-dead': { '.env': 'TELEGRAM_BOT_TOKEN=1:a', 'bot.pid': '444' },
  });
  const snap = [poller(111), poller(222), poller(333)];
  assert.deepStrictEqual(bots.findDuplicatePollers(ch, path.join(ch, 'telegram-a'), snap), [222]);
});

test('discoverBots skips folders whose names could break the typed command line', () => {
  const ch = mkChannels({
    'telegram-ok_1.x': { '.env': 'TELEGRAM_BOT_TOKEN=1:a' },
    'telegram-x’;calc;’': { '.env': 'TELEGRAM_BOT_TOKEN=2:b' },
    'telegram-%PATH%': { '.env': 'TELEGRAM_BOT_TOKEN=3:c' },
  });
  assert.deepStrictEqual(bots.discoverBots(ch, [], {}).map(b => b.id), ['telegram-ok_1.x']);
});
