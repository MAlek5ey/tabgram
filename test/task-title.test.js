'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readTaskTitle } = require('../lib/task-title');

const SID = '85e8417a-114d-4e98-ab31-8ec6d3ee55e5';

function homeWith(lines, projectDir = 'C--work-proj') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-home-'));
  const dir = path.join(home, '.claude', 'projects', projectDir);
  fs.mkdirSync(dir, { recursive: true });
  if (lines) fs.writeFileSync(path.join(dir, `${SID}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  return home;
}

test('the last /rename title wins over generated titles', () => {
  const home = homeWith([
    { type: 'ai-title', aiTitle: 'Generated' },
    { type: 'custom-title', customTitle: 'Old name' },
    { type: 'user', message: { content: 'hi' } },
    { type: 'custom-title', customTitle: 'Fix login' },
    { type: 'ai-title', aiTitle: 'Generated later' },
  ]);
  assert.strictEqual(readTaskTitle(SID, home), 'Fix login');
});

test('without a /rename title the last generated title is used', () => {
  const home = homeWith([
    { type: 'ai-title', aiTitle: 'First' },
    { type: 'ai-title', aiTitle: 'Телеграм бот для Claude Code' },
  ]);
  assert.strictEqual(readTaskTitle(SID, home), 'Телеграм бот для Claude Code');
});

test('no title or no transcript falls back to the short session id', () => {
  assert.strictEqual(readTaskTitle(SID, homeWith([{ type: 'user' }])), '85e8417a');
  assert.strictEqual(readTaskTitle(SID, homeWith(null)), '85e8417a');
});

test('broken lines are skipped', () => {
  const home = homeWith([{ type: 'custom-title', customTitle: 'Name' }]);
  const file = path.join(home, '.claude', 'projects', 'C--work-proj', `${SID}.jsonl`);
  fs.appendFileSync(file, '{"type":"custom-title","customT\n');
  assert.strictEqual(readTaskTitle(SID, home), 'Name');
});
