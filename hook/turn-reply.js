#!/usr/bin/env node
'use strict';
// Claude Code Stop hook: in a session started by the launcher with a bot, send the end of a turn
// that was asked from the terminal to Telegram (config.terminalReplies). Turns asked from Telegram
// are already answered by the reply tool. Errors are swallowed and nothing is printed.
const fs = require('fs');
const path = require('path');
const lib = path.join(__dirname, '..', 'lib');

async function handleStop(input, env, deps = {}) {
  // HANDOFF_BOT is set only by our launcher, so sessions started some other way are left alone.
  if (!input || input.stop_hook_active || !env.HANDOFF_BOT || !env.TELEGRAM_STATE_DIR) return;
  // A claude started from inside the attached session inherits that env; only the session the
  // launcher recorded for this tab may reply.
  const readSession = deps.readSession || (pid => {
    const s = require(path.join(lib, 'sessions'));
    return s.readSession(s.sessionsDir(), pid);
  });
  const rec = readSession(env.HANDOFF_SHELL_PID);
  if (!rec || rec.sessionId !== input.session_id) return;
  const cfg = deps.cfg || require(path.join(lib, 'config')).loadConfig();
  const mode = cfg.terminalReplies;
  if (mode !== 'full' && mode !== 'notify') return;
  const { lastPromptFromChannel, turnMessages } = require(path.join(lib, 'turn'));
  const { titleFromTranscript } = require(path.join(lib, 'task-title'));
  const { sendMessages } = require(path.join(lib, 'notify'));
  let transcript = '';
  try { transcript = fs.readFileSync(input.transcript_path, 'utf8'); } catch {}
  if (lastPromptFromChannel(transcript)) return;
  const texts = turnMessages({
    mode,
    task: titleFromTranscript(transcript, input.session_id),
    text: input.last_assistant_message,
    doneTemplate: cfg.terminalDoneMessage,
  });
  await sendMessages(env.TELEGRAM_STATE_DIR, texts, deps.fetchFn);
}

function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function main() {
  try { await handleStop(JSON.parse((await readStdin()) || '{}'), process.env); } catch {}
  process.exit(0);
}

if (require.main === module) main();

module.exports = { handleStop };
