'use strict';

function quoteArg(kind, s) {
  // PowerShell also treats the curly quotes ‘ ’ ‚ ‛ as single quotes.
  if (kind === 'powershell') return `'${s.replace(/['‘’‚‛]/g, '$&$&')}'`;
  if (kind === 'cmd') return `"${s.replace(/"/g, '""')}"`;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function buildCommandLine(kind, argv) {
  const line = argv.map(a => quoteArg(kind, a)).join(' ');
  return kind === 'powershell' ? `& ${line}` : line;
}

module.exports = { quoteArg, buildCommandLine };
