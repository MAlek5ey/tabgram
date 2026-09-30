'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFileAtomic } = require('./config');

// Claude Code remembers a plugin MCP server that failed to start and skips it for 15 minutes,
// across restarts. The Telegram plugin is enabled globally, so every session started without
// a bot (no TELEGRAM_STATE_DIR, no token) records such a failure, and a handoff within the
// next 15 minutes would come up without the channel.
const TELEGRAM_SERVER = 'plugin:telegram:telegram';

function clearPluginFailure(server, home = os.homedir()) {
  const file = path.join(home, '.claude', 'mcp-needs-auth-cache.json');
  let cache;
  try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return false; }
  if (!cache || typeof cache !== 'object' || !Object.hasOwn(cache, server)) return false;
  delete cache[server];
  writeFileAtomic(file, JSON.stringify(cache));
  return true;
}

module.exports = { TELEGRAM_SERVER, clearPluginFailure };
