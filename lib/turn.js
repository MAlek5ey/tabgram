'use strict';
// What to send to Telegram when a turn ends in a session with a bot attached (config.terminalReplies).

const DEFAULT_DONE_MESSAGE = '✅ Done: {task}';
const TELEGRAM_LIMIT = 4000; // Bot API allows 4096 characters; keep a margin

function promptText(rec) {
  if (!rec || rec.type !== 'user' || rec.isMeta || !rec.message) return null;
  const c = rec.message.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return null;
  const text = c.find(b => b && b.type === 'text');
  return text ? text.text || '' : null;
}

// True when the prompt that started the current turn came from a channel (the reply tool answers those).
// Tool results are user records too, but carry no text block, so they are skipped.
function lastPromptFromChannel(transcript) {
  const lines = (transcript || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"user"')) continue;
    let rec;
    try { rec = JSON.parse(lines[i]); } catch { continue; }
    const text = promptText(rec);
    if (text !== null) return text.trimStart().startsWith('<channel');
  }
  return false;
}

function splitMessage(text, limit = TELEGRAM_LIMIT) {
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    const nl = rest.lastIndexOf('\n', limit);
    const cut = nl > limit / 2 ? nl : limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(nl === cut ? cut + 1 : cut);
  }
  if (rest.length) parts.push(rest);
  return parts;
}

function turnMessages({ mode, task, text, doneTemplate }) {
  const done = () => [(doneTemplate || DEFAULT_DONE_MESSAGE).split('{task}').join(task)];
  if (mode === 'notify') return done();
  if (mode !== 'full') return [];
  const body = (text || '').trim();
  return body ? splitMessage(`🖥 ${task}\n\n${body}`) : done();
}

module.exports = { DEFAULT_DONE_MESSAGE, lastPromptFromChannel, splitMessage, turnMessages };
