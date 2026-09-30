'use strict';
const test = require('node:test');
const assert = require('node:assert');
const h = require('../lib/handoff');

test('clearInputKeys: default mode clears line and never types a letter', () => {
  const keys = h.clearInputKeys('normal');
  assert.deepStrictEqual(keys, ['\x1b', '\x05', '\x15']);
});

test('clearInputKeys: vim mode re-enters insert mode before clearing', () => {
  assert.deepStrictEqual(h.clearInputKeys('vim'), ['\x1b', 'i', '\x05', '\x15']);
});

test('readEditorMode reads ~/.claude.json, defaults to normal', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-ed-'));
  assert.strictEqual(h.readEditorMode(home), 'normal');
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ editorMode: 'vim' }));
  assert.strictEqual(h.readEditorMode(home), 'vim');
});

test('timeoutMessage tells how to resume by hand', () => {
  assert.match(h.timeoutMessage('abc-123'), /claude --resume abc-123/);
});

test('inFlight lets one handoff per tab run at a time', () => {
  const f = h.createInFlight();
  assert.strictEqual(f.enter(42), true);
  assert.strictEqual(f.enter(42), false);
  assert.strictEqual(f.enter(7), true);
  f.leave(42);
  assert.strictEqual(f.enter(42), true);
});
