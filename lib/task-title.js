'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// A session's name: the last /rename title, else the last title Claude Code generated,
// else the short session id. Both live in the transcript ~/.claude/projects/<dir>/<id>.jsonl.
function findTranscript(sessionId, home) {
  const root = path.join(home, '.claude', 'projects');
  let dirs = [];
  try { dirs = fs.readdirSync(root); } catch { return null; }
  for (const d of dirs) {
    const f = path.join(root, d, `${sessionId}.jsonl`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function titleFromTranscript(text, sessionId) {
  let custom = null, generated = null;
  for (const line of (text || '').split('\n')) {
    if (!line.includes('-title"')) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.type === 'custom-title' && rec.customTitle) custom = rec.customTitle;
    else if (rec.type === 'ai-title' && rec.aiTitle) generated = rec.aiTitle;
  }
  return custom || generated || String(sessionId || '').slice(0, 8);
}

function readTaskTitle(sessionId, home = os.homedir()) {
  const file = findTranscript(sessionId, home);
  let text = '';
  try { text = file ? fs.readFileSync(file, 'utf8') : ''; } catch {}
  return titleFromTranscript(text, sessionId);
}

module.exports = { readTaskTitle, titleFromTranscript };
