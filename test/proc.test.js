'use strict';
const test = require('node:test');
const assert = require('node:assert');
const proc = require('../lib/proc');

const WIN_JSON = JSON.stringify([
  { ProcessId: 10, ParentProcessId: 1, Name: 'Code.exe', CommandLine: 'Code.exe' },
  { ProcessId: 20, ParentProcessId: 10, Name: 'powershell.exe', CommandLine: 'powershell.exe -noexit' },
  { ProcessId: 30, ParentProcessId: 20, Name: 'claude.exe', CommandLine: '"C:\\x\\claude.exe"' },
  { ProcessId: 40, ParentProcessId: 30, Name: 'cmd.exe', CommandLine: 'cmd /d /s /c node "C:/Users/u/.claude/x/session-map.js"' },
  { ProcessId: 50, ParentProcessId: 40, Name: 'node.exe', CommandLine: 'node session-map.js' },
]);

test('parseWindowsSnapshot maps CIM fields and handles single object', () => {
  const s = proc.parseWindowsSnapshot(WIN_JSON);
  assert.deepStrictEqual(s[2], { pid: 30, ppid: 20, name: 'claude.exe', cmd: '"C:\\x\\claude.exe"' });
  const one = proc.parseWindowsSnapshot(JSON.stringify({ ProcessId: 5, ParentProcessId: 0, Name: 'x', CommandLine: null }));
  assert.deepStrictEqual(one, [{ pid: 5, ppid: 0, name: 'x', cmd: '' }]);
  assert.deepStrictEqual(proc.parseWindowsSnapshot('  '), []);
});

test('parsePsSnapshot takes basename of the first token as name', () => {
  const s = proc.parsePsSnapshot('  1     0 /sbin/launchd\n 200   1 /usr/local/bin/claude --resume abc\n\n');
  assert.deepStrictEqual(s[1], { pid: 200, ppid: 1, name: 'claude', cmd: '/usr/local/bin/claude --resume abc' });
});

test('ancestors / isDescendant', () => {
  const s = proc.parseWindowsSnapshot(WIN_JSON);
  assert.deepStrictEqual(proc.ancestors(s, 50).map(p => p.pid), [50, 40, 30, 20, 10]);
  assert.strictEqual(proc.isDescendant(s, 30, 20), true);
  assert.strictEqual(proc.isDescendant(s, 20, 30), false);
  assert.strictEqual(proc.isDescendant(s, 999, 20), false);
});

test('ancestors survives a ppid cycle', () => {
  const s = [{ pid: 1, ppid: 2, name: 'a', cmd: '' }, { pid: 2, ppid: 1, name: 'b', cmd: '' }];
  assert.deepStrictEqual(proc.ancestors(s, 1).map(p => p.pid), [1, 2]);
});

test('isClaudeProcess recognises native binary and npm cli.js', () => {
  assert.ok(proc.isClaudeProcess({ name: 'claude.exe', cmd: '' }));
  assert.ok(proc.isClaudeProcess({ name: 'claude', cmd: '' }));
  assert.ok(proc.isClaudeProcess({ name: 'node', cmd: 'node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js' }));
  assert.ok(!proc.isClaudeProcess({ name: 'node.exe', cmd: 'node C:/Users/u/.claude/x/session-map.js' }));
});

test('locateClaude: hook under claude under shell', () => {
  const s = proc.parseWindowsSnapshot(WIN_JSON);
  assert.deepStrictEqual(proc.locateClaude(s, 50), { claudePid: 30, parentPid: 20 });
});

test('locateClaude climbs through cmd shim started by the launcher', () => {
  const s = [
    { pid: 20, ppid: 1, name: 'powershell.exe', cmd: 'powershell' },
    { pid: 21, ppid: 20, name: 'node.exe', cmd: 'node "C:/p/launcher/launch.js" --resume x' },
    { pid: 22, ppid: 21, name: 'cmd.exe', cmd: 'cmd.exe /d /s /c "claude --resume x"' },
    { pid: 23, ppid: 22, name: 'claude.exe', cmd: 'claude.exe --resume x' },
    { pid: 24, ppid: 23, name: 'node.exe', cmd: 'node session-map.js' },
  ];
  assert.deepStrictEqual(proc.locateClaude(s, 24), { claudePid: 22, parentPid: 21 });
});

test('locateClaude returns null when no claude ancestor', () => {
  assert.strictEqual(proc.locateClaude([{ pid: 1, ppid: 0, name: 'bash', cmd: 'bash' }], 1), null);
});

test('shellKind', () => {
  assert.strictEqual(proc.shellKind('powershell.exe'), 'powershell');
  assert.strictEqual(proc.shellKind('pwsh'), 'powershell');
  assert.strictEqual(proc.shellKind('CMD.EXE'), 'cmd');
  assert.strictEqual(proc.shellKind('bash.exe'), 'posix');
  assert.strictEqual(proc.shellKind('zsh'), 'posix');
});

test('isAlive: self alive, bogus pid dead', () => {
  assert.strictEqual(proc.isAlive(process.pid), true);
  assert.strictEqual(proc.isAlive(0), false);
  assert.strictEqual(proc.isAlive(2 ** 30), false);
});

test('snapshot on this machine contains the current process', () => {
  const s = proc.snapshot();
  assert.ok(proc.findProc(s, process.pid));
});

test('locateClaude does not climb from a nested claude -p into the outer claude', () => {
  const s = [
    { pid: 20, ppid: 1, name: 'powershell.exe', cmd: 'powershell' },
    { pid: 30, ppid: 20, name: 'claude.exe', cmd: 'claude' },
    { pid: 40, ppid: 30, name: 'claude.exe', cmd: 'claude -p hi' },
    { pid: 50, ppid: 40, name: 'node.exe', cmd: 'node session-map.js' },
  ];
  assert.deepStrictEqual(proc.locateClaude(s, 50), { claudePid: 40, parentPid: 30 });
});

test('locateClaude does not climb through a cmd running claude -p inside claude', () => {
  const s = [
    { pid: 20, ppid: 1, name: 'powershell.exe', cmd: 'powershell' },
    { pid: 30, ppid: 20, name: 'claude.exe', cmd: 'claude' },
    { pid: 35, ppid: 30, name: 'cmd.exe', cmd: 'cmd /d /s /c "claude -p hi"' },
    { pid: 40, ppid: 35, name: 'claude.exe', cmd: 'claude -p hi' },
    { pid: 50, ppid: 40, name: 'node.exe', cmd: 'node session-map.js' },
  ];
  assert.deepStrictEqual(proc.locateClaude(s, 50), { claudePid: 35, parentPid: 30 });
});
