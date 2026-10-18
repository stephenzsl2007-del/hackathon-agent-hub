# Windows 开发与使用

这版以 [Discussion #4：Windows 开发指南](https://github.com/stephenzsl2007-del/hackathon-agent-hub/discussions/4) 和 main 的 `f79907c` 为基础。保留 macOS 入口，新增 Windows 便携构建。

## 运行与分发

在 Windows 原生 PowerShell 中使用 Node.js 24、pnpm 11.25.0：

```powershell
cd desktop-world
pnpm.cmd install --frozen-lockfile
pnpm.cmd desktop
pnpm.cmd check
pnpm.cmd test
pnpm.cmd package:win
```

安装依赖后也可双击 `start-windows.cmd`。构建输出为 `dist/Xiyu-1.0.0-win32-x64/` 和同名 ZIP（架构随本机 Node/Electron 而定）。完整解压后双击 `Xiyu.exe`，保留同目录全部文件，无需另装 Node.js。`package:win --no-zip` 可跳过压缩。当前是未签名便携版，没有安装器和自动更新。

默认存档在 `%APPDATA%/息屿/`。开发验收可先设置 `$env:XIYU_PROFILE_DIR = '一个绝对路径'`，用独立配置隔离日常存档；关闭该 PowerShell 或移除这个环境变量后恢复默认目录。

## 操作

| 操作 | Windows 入口 |
| --- | --- |
| 打开工具 | 右键小岛；画面中的凳子、堆肥箱、风车也有入口 |
| 移动 | 按住 Alt 拖动，或右键「移动花园」 |
| 找回与恢复交互 | Ctrl+Alt+Shift+G；通知区域小叶子可打开相同菜单 |
| 文件投喂模式 | Ctrl+Alt+Shift+F |
| 退出 | 托盘「完全退出息屿」或花园有焦点时 Alt+F4 |

默认使用较小的右下角窗口。设置可调整大小、位置和置顶；完全穿透后仍能用快捷键找回。Windows 不支持 Electron 的 `setVisibleOnAllWorkspaces`，因此这里只承诺当前虚拟桌面，切换虚拟桌面时可能暂时看不到花园。

完成专注获得 3 滴水，每滴使一株尚未开花的小苗成长一个阶段；没有可成长植物时保留水滴。演示会在 26 秒后恢复日常花园，也可提前结束；演示中的风雨、点心和种子不会延续到日常状态。

邀请面板可选择网卡地址并刷新二维码，优先普通网卡，降低 WSL、VPN、Clash/Meta 等虚拟网卡的优先级。手机与电脑需要互通的同一 Wi-Fi/热点；首次联网如系统提示，可允许专用网络访问，无需管理员运行或关闭防火墙。手机收到成功提示代表花园已执行；断线与确认超时会明确显示，操作不会自动重放。

## 文件与保存边界

文件投喂先显示清单，逐批确认后才调用系统回收站。普通可写文件才可处理；文件夹、链接/junction、系统和程序目录、AppData、回收站、程序及存档自身均拒绝。路径比较兼容 Windows 大小写、盘符、UNC 和长路径前缀。测试只使用自行创建的临时文件及替代回收函数，没有移动用户文件。

保存失败时保留上一份磁盘存档。退出时如最终保存失败或花园未回应，可重试、返回花园，或明确选择仍然退出。`tests/verify-native-trash.cjs` 专用于 macOS，Windows 会直接拒绝运行。

## 本机验收记录

2026-10-18：Windows 11 Home 64 位，系统版本 10.0.26200；Node 24.15.0，pnpm 11.25.0。以下在构建后的 `Xiyu.exe` 和独立临时配置中执行：

- 透明窗口和像素素材成功显示，使用真实 Windows 窗口检查画面。
- 完全穿透时实际点击岛屿，下层专用测试窗口计数从 0 增至 1；实际按 Ctrl+Alt+Shift+G 恢复交互，两个快捷键均注册成功。
- 1 分钟真实计时、暂停与继续，完成后获得 3 滴水；使用一滴后余额为 2，小苗推进一阶段。
- 手机尺寸浏览器页面播种，花园植物数增加 1 后才显示成功；二维码加载成功，网卡选项可列出。
- 提前结束演示及完整演示后，日常植物恢复，雨、风源、飞行种子与点心均清空。
- 制造临时写入失败后关闭窗口，成功触发保存失败分支并保留花园；移除故障后保存成功。
- 实际 Alt+F4 正常退出，再启动最终便携版：19 株植物、2 滴水和已完成专注均恢复，没有重复发放奖励；WLAN 排在虚拟网卡之前。
- 16 项自动测试全通过、无跳过：存档、退出握手、回收保护与 junction、服务异常输入、手机回执和超时、网卡排序、演示恢复与浇水资源。

![Windows 花园工具界面](verification/windows-garden.png)

尚需现场补测：不同 DPI/多显示器插拔、休眠唤醒、实体麦克风、不同手机通过 Wi-Fi 入站连接、系统回收站真实移入和恢复、长时间运行。上述项目没有用单元测试结果代替实机结论。GitHub Actions 配置了 Windows/macOS 检查，Windows 额外执行便携构建。
