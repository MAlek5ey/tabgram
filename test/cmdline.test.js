'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildCommandLine, quoteArg } = require('../lib/cmdline');

const argv = ['C:/Program Files/nodejs/node.exe', "C:/Users/O'Neil User/ext/launcher/launch.js", '--resume', 'abc-1', '--bot', 'C:\\Users\\First Last\\.claude\\channels\\telegram-a'];

test('powershell: call operator + single quotes, doubled inner quote', () => {
  assert.strictEqual(buildCommandLine('powershell', argv),
    "& 'C:/Program Files/nodejs/node.exe' 'C:/Users/O''Neil User/ext/launcher/launch.js' '--resume' 'abc-1' '--bot' 'C:\\Users\\First Last\\.claude\\channels\\telegram-a'");
});

test('cmd: double quotes', () => {
  assert.strictEqual(buildCommandLine('cmd', ['C:/a b/node.exe', '--resume', 'x']), '"C:/a b/node.exe" "--resume" "x"');
});

test('posix: single quotes with escaped inner quote', () => {
  assert.strictEqual(buildCommandLine('posix', ['/a b/node', "it's", '--resume']), "'/a b/node' 'it'\\''s' '--resume'");
});

test('powershell: curly single quotes are doubled too', () => {
  assert.strictEqual(quoteArg('powershell', 'a’b‘c'), "'a’’b‘‘c'");
});
