'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  channelsDir: null,
  bots: {},
  permissionMode: null,
  extraArgs: [],
  runtime: null,
  claudeCommand: 'claude',
  exitTimeoutMs: 15000,
  connectMessage: null,
  terminalReplies: 'off',
  terminalDoneMessage: null,
};

function dataDir(home = os.homedir()) {
  return path.join(home, '.claude', 'tabgram');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

function loadConfig(home = os.homedir()) {
  let user = {};
  try { user = readJson(path.join(dataDir(home), 'config.json')) || {}; } catch { user = {}; }
  const cfg = { ...DEFAULTS, ...user };
  if (!cfg.channelsDir) cfg.channelsDir = path.join(home, '.claude', 'channels');
  if (!Array.isArray(cfg.extraArgs)) cfg.extraArgs = [];
  if (!cfg.bots || typeof cfg.bots !== 'object') cfg.bots = {};
  // A value of the wrong type falls back to its default (a string timeout would never expire).
  cfg.exitTimeoutMs = Number(cfg.exitTimeoutMs) > 0 ? Number(cfg.exitTimeoutMs) : DEFAULTS.exitTimeoutMs;
  if (!['off', 'notify', 'full'].includes(cfg.terminalReplies)) cfg.terminalReplies = DEFAULTS.terminalReplies;
  if (typeof cfg.claudeCommand !== 'string' || !cfg.claudeCommand) cfg.claudeCommand = DEFAULTS.claudeCommand;
  return cfg;
}

// Write to a temporary file and rename it over the target, so a crash never leaves a truncated file.
function writeFileAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function loadInstallInfo(home = os.homedir()) {
  try { return readJson(path.join(dataDir(home), 'install.json')); } catch { return null; }
}

module.exports = { dataDir, readJson, writeFileAtomic, loadConfig, loadInstallInfo };
