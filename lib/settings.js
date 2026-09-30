'use strict';
const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./config');

// claude-telegram-handoff is the name earlier versions were installed under.
const OURS = /(?:tabgram|claude-telegram-handoff).*hook[\\/][\w-]+\.js/;

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  return text.trim() ? JSON.parse(text) : {};
}

function writeSettings(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(obj, null, 2) + '\n');
}

const fwd = p => p.replace(/\\/g, '/');

function hookCommand(execPath, hookFile) {
  return `"${fwd(execPath)}" "${fwd(hookFile)}"`;
}

function isOurHook(h) {
  return !!h && typeof h.command === 'string' && OURS.test(h.command);
}

// Removes our hooks from every event, leaving everyone else's untouched.
function removeHook(settings) {
  const s = JSON.parse(JSON.stringify(settings || {}));
  if (!s.hooks || typeof s.hooks !== 'object') return s;
  for (const event of Object.keys(s.hooks)) {
    if (!Array.isArray(s.hooks[event])) continue;
    s.hooks[event] = s.hooks[event]
      .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !isOurHook(h)) }))
      .filter(g => g.hooks.length);
    if (!s.hooks[event].length) delete s.hooks[event];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  return s;
}

// { event: command }. async: Claude Code runs the hook in the background instead of waiting for it.
function addHooks(settings, commands) {
  const s = removeHook(settings);
  s.hooks = s.hooks || {};
  for (const [event, command] of Object.entries(commands)) {
    s.hooks[event] = s.hooks[event] || [];
    s.hooks[event].push({ hooks: [{ type: 'command', command, async: true }] });
  }
  return s;
}

function addHook(settings, command) {
  return addHooks(settings, { SessionStart: command });
}

module.exports = { readSettings, writeSettings, hookCommand, isOurHook, addHook, addHooks, removeHook };
