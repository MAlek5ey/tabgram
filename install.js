#!/usr/bin/env node
'use strict';
// Installs the VS Code extension (by copying) and the Claude Code SessionStart and Stop hooks.
//   node install.js [--extensions-dir <dir>]   (use bun or node — whichever you want hooks to run with)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dataDir } = require('./lib/config');
const st = require('./lib/settings');
const pkg = require('./extension/package.json');

const EXT_ID = `${pkg.publisher}.${pkg.name}`;
const OLD_EXT_ID = `${pkg.publisher}.claude-telegram-handoff`;
const REPO = __dirname;

function main({ home = os.homedir(), extensionsDir, execPath = process.execPath, log = console.log } = {}) {
  extensionsDir = extensionsDir || path.join(home, '.vscode', 'extensions');
  const settingsFile = path.join(home, '.claude', 'settings.json');
  let settings;
  try { settings = st.readSettings(settingsFile); } catch (e) {
    throw new Error(`cannot parse ${settingsFile} (${e.message}); fix it and run again`);
  }

  const target = path.join(extensionsDir, `${EXT_ID}-${pkg.version}`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const f of ['package.json', 'extension.js']) fs.copyFileSync(path.join(REPO, 'extension', f), path.join(target, f));
  for (const d of ['lib', 'hook', 'launcher']) fs.cpSync(path.join(REPO, d), path.join(target, d), { recursive: true });
  for (const f of ['LICENSE', 'README.md']) {
    if (fs.existsSync(path.join(REPO, f))) fs.copyFileSync(path.join(REPO, f), path.join(target, f));
  }

  const dir = dataDir(home);
  // Earlier versions kept their data in ~/.claude/handoff and the backup in settings.json.handoff.bak.
  moveIfFree(path.join(home, '.claude', 'handoff'), dir);
  const backup = settingsFile + '.tabgram.bak';
  moveIfFree(settingsFile + '.handoff.bak', backup);

  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'install.json'),
    JSON.stringify({ runtime: execPath, root: target, version: pkg.version }, null, 2) + '\n');

  // Keep the settings from before the first install; a reinstall must not overwrite them.
  if (fs.existsSync(settingsFile) && !fs.existsSync(backup)) fs.copyFileSync(settingsFile, backup);
  const hook = name => st.hookCommand(execPath, path.join(target, 'hook', name));
  st.writeSettings(settingsFile, st.addHooks(settings, { SessionStart: hook('session-map.js'), Stop: hook('turn-reply.js') }));
  // Only now, with the hooks pointing at the new copy, is the old one safe to delete.
  removeExtensionDirs(extensionsDir, OLD_EXT_ID);

  log(`Installed ${EXT_ID} ${pkg.version} to ${target}`);
  log('Next: reload VS Code windows (Developer: Reload Window) and restart Claude Code sessions once.');
  return { target };
}

// On Windows a folder that a running VS Code watches can't be renamed; copy it then and leave the old one.
function moveIfFree(from, to, rename = fs.renameSync) {
  if (!fs.existsSync(from) || fs.existsSync(to)) return;
  try { rename(from, to); } catch { fs.cpSync(from, to, { recursive: true }); }
}

function removeExtensionDirs(extensionsDir, id) {
  let names = [];
  try { names = fs.readdirSync(extensionsDir); } catch {}
  for (const n of names.filter(n => n.startsWith(`${id}-`))) {
    fs.rmSync(path.join(extensionsDir, n), { recursive: true, force: true });
  }
}

if (require.main === module) {
  const i = process.argv.indexOf('--extensions-dir');
  try { main({ extensionsDir: i > 0 ? process.argv[i + 1] : undefined }); } catch (e) {
    console.error(`install failed: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { main, EXT_ID, OLD_EXT_ID, removeExtensionDirs, moveIfFree };
