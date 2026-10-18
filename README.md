# hackathon-agent-hub
黑客松团队 AI Agent 共享协作仓库

## 息屿 · 桌面像素小岛

当前项目位于 [`desktop-world/`](desktop-world/)，包含 Electron 桌面窗口、浏览器界面、局域网手机互动、像素素材和本地服务测试。

### 本地开发

安装 Node.js 24 和 pnpm 11.25.0 后运行（Windows PowerShell 可将 `pnpm` 写为 `pnpm.cmd`）：

```sh
cd desktop-world
pnpm install --frozen-lockfile
pnpm desktop
```

使用 `pnpm start` 启动网页模式；macOS 上可运行 `pnpm package:mac` 生成工作区根目录中的 `息屿.app`。

Windows 可双击 `desktop-world/start-windows.cmd` 启动已安装依赖的源码，或运行 `pnpm package:win` 生成可完整解压后运行的便携程序和 ZIP。详细步骤、操作和验收范围见 [Windows 开发与使用说明](desktop-world/docs/WINDOWS.md)。

### 检查

```sh
cd desktop-world
pnpm check
pnpm test
```

### 项目资料

- [桌面窗口与手机互动说明](desktop-world/desktop/README.md)
- [架构与演进计划](desktop-world/docs/ARCHITECTURE.md)
- [像素素材接入约定](desktop-world/art/INTEGRATION_REQUEST.txt)

仓库保存源码、依赖锁文件、运行素材与文档。依赖目录、生成的安装包、日志和本地密钥配置由 `.gitignore` 排除。
