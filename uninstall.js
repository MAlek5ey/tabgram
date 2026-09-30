#!/usr/bin/env node
'use strict';
//   node uninstall.js [--purge] [--extensions-dir <dir>]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { dataDir } = require('./lib/config');
const st = require('./lib/settings');
const { EXT_ID, OLD_EXT_ID, removeExtensionDirs } = require('./install');

function main({ home = os.homedir(), extensionsDir, purge = false, log = console.log, useCodeCli = true } = {}) {
  extensionsDir = extensionsDir || path.join(home, '.vscode', 'extensions');
  // Parse first: an unreadable settings.json must stop us before anything is removed.
  const settingsFile = path.join(home, '.claude', 'settings.json');
  let settings;
  try { settings = st.readSettings(settingsFile); } catch (e) {
    throw new Error(`cannot parse ${settingsFile} (${e.message}); fix it and run again`);
  }
  if (useCodeCli) {
    // Lets VS Code drop its extensions.json entry too; the folder removal below is the fallback.
    try { execFileSync('code', ['--uninstall-extension', EXT_ID], { stdio: 'ignore', shell: process.platform === 'win32' }); } catch {}
  }
  for (const id of [EXT_ID, OLD_EXT_ID]) removeExtensionDirs(extensionsDir, id);

  if (fs.existsSync(settingsFile)) st.writeSettings(settingsFile, st.removeHook(settings));

  if (purge) fs.rmSync(dataDir(home), { recursive: true, force: true });
  log(`Uninstalled ${EXT_ID}${purge ? ' (state purged)' : ''}. Reload VS Code windows.`);
}

if (require.main === module) {
  const i = process.argv.indexOf('--extensions-dir');
  try {
    main({ purge: process.argv.includes('--purge'), extensionsDir: i > 0 ? process.argv[i + 1] : undefined });
  } catch (e) {
    console.error(`uninstall failed: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { main };
