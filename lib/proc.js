'use strict';
const { execFile, execFileSync } = require('child_process');
const path = require('path');

const WIN_PS = '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' +
  'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress';
const MAX_BUFFER = 64 * 1024 * 1024;

function parseWindowsSnapshot(json) {
  if (!json || !json.trim()) return [];
  let rows = JSON.parse(json);
  if (!Array.isArray(rows)) rows = [rows];
  return rows.map(r => ({ pid: r.ProcessId, ppid: r.ParentProcessId, name: r.Name || '', cmd: r.CommandLine || '' }));
}

function parsePsSnapshot(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const cmd = m[3].trim();
    const first = cmd.split(/\s+/)[0] || '';
    out.push({ pid: Number(m[1]), ppid: Number(m[2]), name: path.posix.basename(first), cmd });
  }
  return out;
}

function snapshotCommand(platform) {
  return platform === 'win32'
    ? { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', WIN_PS], parse: parseWindowsSnapshot }
    : { file: 'ps', args: ['-A', '-o', 'pid=,ppid=,args='], parse: parsePsSnapshot };
}

function snapshot(platform = process.platform) {
  const c = snapshotCommand(platform);
  return c.parse(execFileSync(c.file, c.args, { encoding: 'utf8', maxBuffer: MAX_BUFFER, windowsHide: true }));
}

function snapshotAsync(platform = process.platform) {
  const c = snapshotCommand(platform);
  return new Promise((resolve, reject) => {
    execFile(c.file, c.args, { encoding: 'utf8', maxBuffer: MAX_BUFFER, windowsHide: true }, (err, out) => {
      if (err) return reject(err);
      try { resolve(c.parse(out)); } catch (e) { reject(e); }
    });
  });
}

function findProc(snap, pid) {
  return snap.find(p => p.pid === pid);
}

function isAlive(pid) {
  if (!pid || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function ancestors(snap, pid) {
  const byPid = new Map(snap.map(p => [p.pid, p]));
  const out = [];
  const seen = new Set();
  let cur = byPid.get(pid);
  while (cur && !seen.has(cur.pid)) {
    seen.add(cur.pid);
    out.push(cur);
    cur = byPid.get(cur.ppid);
  }
  return out;
}

function isDescendant(snap, pid, ancestorPid) {
  return ancestors(snap, pid).slice(1).some(p => p.pid === ancestorPid);
}

function isClaudeProcess(p) {
  return /^claude(\.exe)?$/i.test(p.name) || /@anthropic-ai[\\/]claude-code[\\/]cli\.js/i.test(p.cmd);
}

// cmd.exe wrapper that Node's spawn({shell:true}) puts between our launcher and claude on Windows
function isClaudeShim(p) {
  return /^cmd\.exe$/i.test(p.name) && /\bclaude\b/i.test(p.cmd) && !/launch\.js/i.test(p.cmd);
}

// Walk up from fromPid to the nearest Claude Code process, then over at most one cmd shim.
// Never climbs into another claude: a nested `claude -p` must not claim the outer tab.
// claudePid = the claude (or its shim), parentPid = whatever started it (shell or launcher).
function locateClaude(snap, fromPid) {
  const chain = ancestors(snap, fromPid);
  const i = chain.findIndex(isClaudeProcess);
  if (i < 0) return null;
  let j = i;
  if (j + 1 < chain.length && isClaudeShim(chain[j + 1])) j++;
  const parent = chain[j + 1];
  return { claudePid: chain[j].pid, parentPid: parent ? parent.pid : null };
}

function shellKind(name) {
  const n = (name || '').toLowerCase();
  if (/^(powershell|pwsh)(\.exe)?$/.test(n)) return 'powershell';
  if (n === 'cmd.exe') return 'cmd';
  return 'posix';
}

module.exports = {
  parseWindowsSnapshot, parsePsSnapshot, snapshot, snapshotAsync, findProc, isAlive,
  ancestors, isDescendant, isClaudeProcess, isClaudeShim, locateClaude, shellKind,
};
