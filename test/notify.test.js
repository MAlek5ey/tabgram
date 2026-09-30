'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readRecipients, formatMessage, notifyConnected, DEFAULT_CONNECT_MESSAGE } = require('../lib/notify');

function botDir(access, env = 'TELEGRAM_BOT_TOKEN=123:abc\n') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-bot-'));
  if (env !== null) fs.writeFileSync(path.join(dir, '.env'), env);
  if (access !== null) fs.writeFileSync(path.join(dir, 'access.json'), JSON.stringify(access));
  return dir;
}

function fakeFetch(status = 200) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: status === 200, status }; };
  fn.calls = calls;
  return fn;
}

test('recipients are the allowlisted users', () => {
  assert.deepStrictEqual(readRecipients(botDir({ allowFrom: ['309', 42] })), ['309', '42']);
  assert.deepStrictEqual(readRecipients(botDir({})), []);
  assert.deepStrictEqual(readRecipients(botDir(null)), []);
});

test('formatMessage substitutes the task name', () => {
  assert.strictEqual(formatMessage('Бот подключен к командной строке с задачей {task}', 'Fix login'),
    'Бот подключен к командной строке с задачей Fix login');
  assert.strictEqual(formatMessage(undefined, 'X'), DEFAULT_CONNECT_MESSAGE.replace('{task}', 'X'));
});

test('notifyConnected sends the message to every recipient', async () => {
  const f = fakeFetch();
  const r = await notifyConnected(botDir({ allowFrom: ['1', '2'] }), 'Task', 'Hi {task}', f);
  assert.deepStrictEqual(r, { sent: 2, failed: 0 });
  assert.deepStrictEqual(f.calls.map(c => c.body), [{ chat_id: '1', text: 'Hi Task' }, { chat_id: '2', text: 'Hi Task' }]);
  assert.match(f.calls[0].url, /^https:\/\/api\.telegram\.org\/bot123:abc\/sendMessage$/);
});

test('an empty template turns the notification off', async () => {
  const f = fakeFetch();
  assert.deepStrictEqual(await notifyConnected(botDir({ allowFrom: ['1'] }), 'T', '', f), { sent: 0, failed: 0 });
  assert.strictEqual(f.calls.length, 0);
});

test('failures are counted, never thrown, and never carry the token', async () => {
  const f = fakeFetch(403);
  assert.deepStrictEqual(await notifyConnected(botDir({ allowFrom: ['1'] }), 'T', 'x', f), { sent: 0, failed: 1 });
  const boom = async () => { throw new Error('network down'); };
  const r = await notifyConnected(botDir({ allowFrom: ['1'] }), 'T', 'x', boom);
  assert.deepStrictEqual(r, { sent: 0, failed: 1 });
  assert.deepStrictEqual(await notifyConnected(botDir({ allowFrom: ['1'] }, null), 'T', 'x', f), { sent: 0, failed: 0 });
});
