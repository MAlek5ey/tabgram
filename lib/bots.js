'use strict';
const fs = require('fs');
const path = require('path');
const { findProc } = require('./proc');

const PREFIX = 'telegram-';

function parseEnvToken(text) {
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = raw.match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '') || null;
  }
  return null;
}

function readToken(stateDir) {
  try { return parseEnvToken(fs.readFileSync(path.join(stateDir, '.env'), 'utf8')); } catch { return null; }
}

function readPid(file) {
  try {
    const n = parseInt(fs.readFileSync(file, 'utf8'), 10);
    return n > 1 ? n : null;
  } catch { return null; }
}

// bot.pid can be stale and its PID recycled, so require a live server.ts process
function isPollerProcess(snap, pid) {
  if (!pid) return false;
  const p = findProc(snap, pid);
  return !!p && /server\.ts/.test(p.cmd);
}

function listDirs(channelsDir) {
  try {
    return fs.readdirSync(channelsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  } catch { return []; }
}

function botLabel(id, cfgBots = {}) {
  const o = cfgBots[id];
  return (o && o.label) || id.replace(/^telegram-/, '');
}

function discoverBots(channelsDir, snap, cfgBots = {}) {
  return listDirs(channelsDir)
    // The folder path is typed into the terminal, so only plain names are offered.
    .filter(name => name.startsWith(PREFIX) && /^[\w.-]+$/.test(name))
    .map(name => ({ name, stateDir: path.join(channelsDir, name) }))
    .filter(({ name, stateDir }) => fs.existsSync(path.join(stateDir, '.env')) && !(cfgBots[name] && cfgBots[name].hidden))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, stateDir }) => {
      const own = isPollerProcess(snap, readPid(path.join(stateDir, 'bot.pid')));
      // A session started without the launcher (e.g. legacy telegram/) may poll the same token.
      const other = own ? null : otherPollers(channelsDir, stateDir, snap)[0];
      return { id: name, label: botLabel(name, cfgBots), stateDir, busy: own || !!other, busyIn: other ? other.name : null };
    });
}

function samePath(a, b) {
  const norm = p => {
    const r = path.resolve(p);
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

// Pollers in OTHER state dirs (incl. legacy "telegram/") that use the same token as the chosen bot.
// The plugin itself already replaces a stale poller in its own state dir.
function otherPollers(channelsDir, stateDir, snap) {
  const token = readToken(stateDir);
  if (!token) return [];
  const found = [];
  for (const name of listDirs(channelsDir)) {
    if (name !== 'telegram' && !name.startsWith(PREFIX)) continue;
    const dir = path.join(channelsDir, name);
    if (samePath(dir, stateDir) || readToken(dir) !== token) continue;
    const pid = readPid(path.join(dir, 'bot.pid'));
    if (isPollerProcess(snap, pid)) found.push({ name, pid });
  }
  return found;
}

function findDuplicatePollers(channelsDir, chosenStateDir, snap) {
  return otherPollers(channelsDir, chosenStateDir, snap).map(p => p.pid);
}

module.exports = { parseEnvToken, readToken, readPid, isPollerProcess, discoverBots, botLabel, findDuplicatePollers };
