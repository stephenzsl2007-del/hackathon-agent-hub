'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function check(filename) {
  if (fs.statSync(filename).isDirectory()) {
    for (const name of fs.readdirSync(filename)) check(path.join(filename, name));
  } else if (/\.(?:cjs|js)$/.test(filename)) execFileSync(process.execPath, ['--check', filename], { stdio: 'inherit', windowsHide: true });
}
for (const name of ['server.cjs', 'desktop', 'public', 'scripts', 'tests']) check(path.join(root, name));
console.log('All JavaScript syntax checks passed.');
