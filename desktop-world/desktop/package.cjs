'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const target = path.resolve(root, '..', '息屿.app');
const runtime = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app');
if (process.platform !== 'darwin') throw new Error('This packaging script targets macOS.');
if (!fs.existsSync(runtime)) throw new Error('Install Electron before packaging.');
if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(runtime, target, { recursive: true, verbatimSymlinks: true });
const dest = path.join(target, 'Contents', 'Resources', 'app');
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(path.join(root, 'public'), path.join(dest, 'public'), { recursive: true });
fs.mkdirSync(path.join(dest, 'desktop'));
for (const filename of ['main.cjs', 'preload.cjs', 'native-services.cjs']) fs.copyFileSync(path.join(root, 'desktop', filename), path.join(dest, 'desktop', filename));
for (const filename of ['package.json', 'server.cjs']) fs.copyFileSync(path.join(root, filename), path.join(dest, filename));
// Copy production dependencies with real contents, independent of pnpm symlinks.
const copied = new Set();
function copyDependency(name, from) {
  if (copied.has(name)) return;
  let resolved;
  try { resolved = require.resolve(`${name}/package.json`, { paths: [from] }); }
  catch {
    resolved = require.resolve(name, { paths: [from] });
    let dir = path.dirname(resolved);
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    resolved = path.join(dir, 'package.json');
  }
  const source = path.dirname(resolved);
  copied.add(name);
  const depDest = path.join(dest, 'node_modules', name);
  fs.mkdirSync(path.dirname(depDest), { recursive: true });
  fs.cpSync(source, depDest, { recursive: true, filter: src => !src.slice(source.length).split(path.sep).includes('node_modules') });
  for (const sub of Object.keys(JSON.parse(fs.readFileSync(resolved)).dependencies || {})) copyDependency(sub, source);
}
for (const dependency of Object.keys(require('../package.json').dependencies || {})) copyDependency(dependency, root);
const plist = path.join(target, 'Contents', 'Info.plist');
const set = (key, value) => execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plist]);
set('CFBundleName', '息屿');
set('CFBundleDisplayName', '息屿');
set('CFBundleIdentifier', 'cc.xiyu.desktop-world');
set('NSMicrophoneUsageDescription', '对着麦克风轻轻吹气，为桌面小岛送来微风。声音仅在本机分析，不会录音或上传。');
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', target], { stdio: 'inherit' });
console.log(`Packaged ${target}`);
