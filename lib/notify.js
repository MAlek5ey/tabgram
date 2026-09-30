'use strict';
const fs = require('fs');
const path = require('path');
const { readToken } = require('./bots');

// Sent straight through the Bot API: sendMessage does not compete with the plugin's getUpdates poll.
const DEFAULT_CONNECT_MESSAGE = 'Bot attached to the terminal session: {task}';

function readRecipients(stateDir) {
  try {
    const access = JSON.parse(fs.readFileSync(path.join(stateDir, 'access.json'), 'utf8'));
    return Array.isArray(access.allowFrom) ? access.allowFrom.map(String) : [];
  } catch { return []; }
}

function formatMessage(template, task) {
  return (template === undefined || template === null ? DEFAULT_CONNECT_MESSAGE : template).split('{task}').join(task);
}

// Sends each text to every allowlisted user, in order. Never throws and never reports the token:
// the result is only counts.
async function sendMessages(stateDir, texts, fetchFn = globalThis.fetch) {
  const result = { sent: 0, failed: 0 };
  const token = readToken(stateDir);
  const recipients = readRecipients(stateDir);
  if (!texts.length || !token || !recipients.length || typeof fetchFn !== 'function') return result;
  for (const chatId of recipients) {
    for (const text of texts) {
      try {
        const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
        });
        if (res && res.ok) result.sent++; else result.failed++;
      } catch { result.failed++; }
    }
  }
  return result;
}

async function notifyConnected(stateDir, task, template, fetchFn = globalThis.fetch) {
  if (template === '') return { sent: 0, failed: 0 };
  return sendMessages(stateDir, [formatMessage(template, task)], fetchFn);
}

module.exports = { DEFAULT_CONNECT_MESSAGE, readRecipients, formatMessage, sendMessages, notifyConnected };
