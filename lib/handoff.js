'use strict';
// Pure helpers for the extension's handoff sequence (kept out of extension.js so they can be tested).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readJson } = require('./config');

// Keys sent before `/exit`: Esc stops generation / closes menus, Ctrl+E moves to the end of the line,
// Ctrl+U clears it. In vim mode Esc leaves insert mode, so `i` goes back in before clearing —
// otherwise `/exit` would be read as vim commands.
function clearInputKeys(editorMode) {
  return editorMode === 'vim' ? ['\x1b', 'i', '\x05', '\x15'] : ['\x1b', '\x05', '\x15'];
}

function readEditorMode(home = os.homedir()) {
  try {
    const j = readJson(path.join(home, '.claude.json'));
    return j && j.editorMode === 'vim' ? 'vim' : 'normal';
  } catch { return 'normal'; }
}

function timeoutMessage(sessionId) {
  return `Claude Code did not exit in time, so the launcher was not started. If it has exited by now, resume by hand: claude --resume ${sessionId}`;
}

function createInFlight() {
  const busy = new Set();
  return {
    enter(key) { if (busy.has(key)) return false; busy.add(key); return true; },
    leave(key) { busy.delete(key); },
  };
}

module.exports = { clearInputKeys, readEditorMode, timeoutMessage, createInFlight };
