'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { copyApp } = require('./package-assets.cjs');
if (process.platform !== 'win32') throw new Error('请在 Windows 上生成 Windows 程序包。');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const runtime = path.join(root, 'node_modules', 'electron', 'dist');
if (!fs.existsSync(path.join(runtime, 'electron.exe'))) throw new Error('请先运行 pnpm install 安装 Electron。');
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
const name = 'Xiyu-' + version + '-win32-' + process.arch;
const target = path.join(output, name);
const stage = fs.mkdtempSync(path.join(output, '.xiyu-stage-'));
function removeGenerated(folder) {
  const resolved = path.resolve(folder);
  if (path.dirname(resolved) !== output || !(path.basename(resolved).startsWith('.xiyu-stage-') || resolved === target)) throw new Error('Refusing to remove path outside build output.');
  fs.rmSync(resolved, { recursive: true, force: true });
}
try {
  fs.cpSync(runtime, stage, { recursive: true, dereference: true });
  fs.renameSync(path.join(stage, 'electron.exe'), path.join(stage, 'Xiyu.exe'));
  fs.rmSync(path.join(stage, 'resources', 'default_app.asar'), { force: true });
  copyApp(root, path.join(stage, 'resources', 'app'));
  fs.writeFileSync(path.join(stage, '使用说明.txt'), [
    '息屿 · Windows 桌面花园', '',
    '请先完整解压程序包，再双击 Xiyu.exe。无需另装 Node.js；请保留同目录的全部文件。',
    '右键小岛打开工具；Alt + 拖动移动花园。',
    'Ctrl+Alt+Shift+G 找回花园；Ctrl+Alt+Shift+F 进入文件投喂模式。',
    '任务栏通知区域的小叶子可显示花园、恢复鼠标交互或完全退出。',
    '文件回收需要逐批确认，成功后移入 Windows 回收站。',
    '完成专注获得 3 滴水；每滴让一株小苗长大一个阶段。',
    '存档保存在当前用户的 AppData/Roaming/息屿，升级程序时请保留存档。',
    '手机互动需要同一 Wi-Fi；邀请面板可以切换网卡地址。',
  ].join('\r\n'), 'utf8');
  if (fs.existsSync(target)) removeGenerated(target);
  fs.renameSync(stage, target);
  if (!process.argv.includes('--no-zip')) {
    execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'zip-windows.ps1'), '-Source', target, '-Destination', target + '.zip'],
      { stdio: 'inherit', windowsHide: true });
  }
  console.log('Windows 程序包：' + target);
  if (!process.argv.includes('--no-zip')) console.log('分发压缩包：' + target + '.zip');
} finally { if (fs.existsSync(stage)) removeGenerated(stage); }
