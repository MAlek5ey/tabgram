'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { lastPromptFromChannel, splitMessage, turnMessages, DEFAULT_DONE_MESSAGE } = require('../lib/turn');

const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
const channel = '<channel source="plugin:telegram:telegram" chat_id="1" message_id="2">\nhi\n</channel>';

test('a prompt typed in the terminal is not from the channel', () => {
  const t = jsonl([
    { type: 'user', message: { role: 'user', content: channel } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } },
    { type: 'user', message: { role: 'user', content: 'run the tests' } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'x' }] } },
  ]);
  assert.strictEqual(lastPromptFromChannel(t), false);
});

test('a Telegram message is from the channel, even after tool results and meta lines', () => {
  const t = jsonl([
    { type: 'user', message: { role: 'user', content: 'earlier terminal prompt' } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: channel }] } },
    { type: 'user', isMeta: true, message: { role: 'user', content: 'system note' } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'x' }] } },
  ]);
  assert.strictEqual(lastPromptFromChannel(t), true);
});

test('an empty or broken transcript counts as a terminal prompt', () => {
  assert.strictEqual(lastPromptFromChannel(''), false);
  assert.strictEqual(lastPromptFromChannel('{"type":"user","mess\n'), false);
});

test('splitMessage keeps chunks under the limit, preferring line breaks', () => {
  assert.deepStrictEqual(splitMessage('short', 10), ['short']);
  assert.deepStrictEqual(splitMessage('aaaa\nbbbb\ncccc', 10), ['aaaa\nbbbb', 'cccc']);
  assert.deepStrictEqual(splitMessage('x'.repeat(25), 10), ['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
});

test('turnMessages follows the mode', () => {
  assert.deepStrictEqual(turnMessages({ mode: 'off', task: 'T', text: 'answer' }), []);
  assert.deepStrictEqual(turnMessages({ mode: undefined, task: 'T', text: 'answer' }), []);
  assert.deepStrictEqual(turnMessages({ mode: 'notify', task: 'T', text: 'answer' }), [DEFAULT_DONE_MESSAGE.replace('{task}', 'T')]);
  assert.deepStrictEqual(turnMessages({ mode: 'notify', task: 'T', text: 'a', doneTemplate: 'Готово: {task}' }), ['Готово: T']);
  assert.deepStrictEqual(turnMessages({ mode: 'full', task: 'T', text: 'answer' }), ['🖥 T\n\nanswer']);
});

test('full mode with no text falls back to the done notice; long text is split', () => {
  assert.deepStrictEqual(turnMessages({ mode: 'full', task: 'T', text: '  ' }), [DEFAULT_DONE_MESSAGE.replace('{task}', 'T')]);
  const parts = turnMessages({ mode: 'full', task: 'T', text: 'y'.repeat(9000) });
  assert.strictEqual(parts.length, 3);
  assert.ok(parts.every(p => p.length <= 4000));
  assert.strictEqual(parts.join('').replace('🖥 T\n\n', ''), 'y'.repeat(9000));
});
