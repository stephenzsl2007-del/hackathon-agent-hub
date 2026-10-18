'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Resolve and copy real package contents so a portable build has no pnpm links.
function copyApp(root, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(path.join(root, 'public'), path.join(dest, 'public'), { recursive: true });
  fs.mkdirSync(path.join(dest, 'desktop'), { recursive: true });
  for (const name of ['main.cjs', 'preload.cjs', 'native-services.cjs', 'keyboard-activity.cjs', 'keyboard-activity.cs', 'build-keyboard.ps1', 'parallel-folder.cjs']) fs.copyFileSync(path.join(root, 'desktop', name), path.join(dest, 'desktop', name));
  fs.copyFileSync(path.join(root, 'server.cjs'), path.join(dest, 'server.cjs'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const { scripts, devDependencies, ...runtimeManifest } = manifest;
  fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify(runtimeManifest, null, 2));
  const copied = new Map();
  function copyDependency(name, from) {
    let resolved;
    try { resolved = require.resolve(name + '/package.json', { paths: [from] }); }
    catch {
      let dir = path.dirname(require.resolve(name, { paths: [from] }));
      while (!fs.existsSync(path.join(dir, 'package.json'))) {
        const parent = path.dirname(dir);
        if (parent === dir) throw new Error('Cannot locate dependency: ' + name);
        dir = parent;
      }
      resolved = path.join(dir, 'package.json');
    }
    const source = path.dirname(resolved);
    if (copied.has(name)) {
      if (copied.get(name) !== source) throw new Error('Conflicting runtime dependency: ' + name);
      return;
    }
    copied.set(name, source);
    const depDest = path.join(dest, 'node_modules', name);
    fs.mkdirSync(path.dirname(depDest), { recursive: true });
    fs.cpSync(source, depDest, { recursive: true, dereference: true, filter: src => !src.slice(source.length).split(path.sep).includes('node_modules') });
    for (const child of Object.keys(JSON.parse(fs.readFileSync(resolved, 'utf8')).dependencies || {})) copyDependency(child, source);
  }
  for (const name of Object.keys(manifest.dependencies || {})) copyDependency(name, root);
}
module.exports = { copyApp };
