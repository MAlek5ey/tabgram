'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { handleStop } = require('../hook/turn-reply');

function setup({ prompt = 'terminal prompt', title = 'My task' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-stop-'));
  const bot = path.join(dir, 'telegram-work');
  fs.mkdirSync(bot);
  fs.writeFileSync(path.join(bot, '.env'), 'TELEGRAM_BOT_TOKEN=1:x\n');
  fs.writeFileSync(path.join(bot, 'access.json'), JSON.stringify({ allowFrom: ['7'] }));
  const transcript = path.join(dir, 's.jsonl');
  fs.writeFileSync(transcript, [
    { type: 'custom-title', customTitle: title },
    { type: 'user', message: { role: 'user', content: prompt } },
  ].map(r => JSON.stringify(r)).join('\n') + '\n');
  const calls = [];
  const fetchFn = async (url, init) => { calls.push(JSON.parse(init.body).text); return { ok: true }; };
  return {
    calls,
    input: { session_id: 'abcdef1234', transcript_path: transcript, stop_hook_active: false, last_assistant_message: 'All tests pass.' },
    env: { HANDOFF_BOT: 'telegram-work', TELEGRAM_STATE_DIR: bot },
    deps: { cfg: { terminalReplies: 'full' }, fetchFn, readSession: () => ({ sessionId: 'abcdef1234' }) },
  };
}

test('full mode sends the reply to a terminal prompt', async () => {
  const s = setup();
  await handleStop(s.input, s.env, s.deps);
  assert.deepStrictEqual(s.calls, ['🖥 My task\n\nAll tests pass.']);
});

test('notify mode sends only the done notice', async () => {
  const s = setup();
  await handleStop(s.input, s.env, { ...s.deps, cfg: { terminalReplies: 'notify', terminalDoneMessage: 'Готово: {task}' } });
  assert.deepStrictEqual(s.calls, ['Готово: My task']);
});

test('nothing is sent when the prompt came from Telegram, the mode is off, or no bot is attached', async () => {
  const s = setup({ prompt: '<channel source="plugin:telegram:telegram" chat_id="7">hi</channel>' });
  await handleStop(s.input, s.env, s.deps);
  const off = setup();
  await handleStop(off.input, off.env, { ...off.deps, cfg: { terminalReplies: 'off' } });
  const noBot = setup();
  await handleStop(noBot.input, { TELEGRAM_STATE_DIR: noBot.env.TELEGRAM_STATE_DIR }, noBot.deps);
  const again = setup();
  await handleStop({ ...again.input, stop_hook_active: true }, again.env, again.deps);
  assert.deepStrictEqual([s.calls, off.calls, noBot.calls, again.calls], [[], [], [], []]);
});

test('a claude started inside the attached session (it inherits the env) sends nothing', async () => {
  const s = setup();
  await handleStop(s.input, { ...s.env, HANDOFF_SHELL_PID: '20' },
    { ...s.deps, readSession: () => ({ sessionId: 'nested-other' }) });
  assert.deepStrictEqual(s.calls, []);
});
