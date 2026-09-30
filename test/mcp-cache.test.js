'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { clearPluginFailure, TELEGRAM_SERVER } = require('../lib/mcp-cache');

function tmpHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cth-home-'));
  fs.mkdirSync(path.join(home, '.claude'));
  return home;
}
const cacheFile = home => path.join(home, '.claude', 'mcp-needs-auth-cache.json');

test('removes the telegram failure entry and keeps the others', () => {
  const home = tmpHome();
  fs.writeFileSync(cacheFile(home), JSON.stringify({
    [TELEGRAM_SERVER]: { timestamp: 1, id: 'a' },
    'some-http-server': { timestamp: 2 },
  }));
  assert.strictEqual(clearPluginFailure(TELEGRAM_SERVER, home), true);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(cacheFile(home), 'utf8')), { 'some-http-server': { timestamp: 2 } });
});

test('leaves the file alone when there is no telegram entry', () => {
  const home = tmpHome();
  const body = JSON.stringify({ other: { timestamp: 2 } });
  fs.writeFileSync(cacheFile(home), body);
  assert.strictEqual(clearPluginFailure(TELEGRAM_SERVER, home), false);
  assert.strictEqual(fs.readFileSync(cacheFile(home), 'utf8'), body);
});

test('missing or corrupt cache file is not an error', () => {
  const home = tmpHome();
  assert.strictEqual(clearPluginFailure(TELEGRAM_SERVER, home), false);
  fs.writeFileSync(cacheFile(home), '{oops');
  assert.strictEqual(clearPluginFailure(TELEGRAM_SERVER, home), false);
  assert.strictEqual(fs.readFileSync(cacheFile(home), 'utf8'), '{oops');
});
