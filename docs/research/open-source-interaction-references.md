# 桌面花园：开源交互参考

核查日期：2026-10-18。
关联计划：[桌面花园创意计划 v1](../plans/desktop-garden-v1.md)。

本轮核查使用项目原仓库的 README、许可证、GitHub 元数据与必要的局部源码。**没有安装运行这些项目，也没有证明它们能直接组合为本项目。** 下面分开记录“来源已有能力”和“我们的花园设计”；后者需要自行实现和验证。本次未引入任何第三方代码、模型或美术/音频素材。

## 1. 最值得借鉴的六个项目

### 1.1 BongoCat：让真实键鼠活动有即时回应

- 原仓库：https://github.com/ayangweb/BongoCat
- 核查快照：[30d0c34f557a76e7f265befa94e71704c813f8a9](https://github.com/ayangweb/BongoCat/tree/30d0c34f557a76e7f265befa94e71704c813f8a9)
- 许可证：[Apache-2.0](https://github.com/ayangweb/BongoCat/blob/30d0c34f557a76e7f265befa94e71704c813f8a9/LICENSE)。
- 已核实：README 将其描述为 Windows/macOS 桌面伙伴，眼睛和爪子跟随鼠标，对键盘、鼠标按钮及手柄按钮作出动作回应。
- 借鉴到花园：键盘节奏转成细雨，鼠标接近时草叶偏转，用户开始/停止操作时反馈平滑变化。
- 边界：我们只保留聚合输入强度，不需要记录按键内容；该项目的设备支持不自动等于本项目支持。角色模型与其他素材需独立核查，计划不复用猫的形象。

### 1.2 Lively Wallpaper：花园怎样融入日常桌面

- 原入口：https://github.com/rocksdanister/lively
- 本次核查该入口重定向至：https://github.com/lively-community/lively
- 核查快照：[25a0a5f4ed1988ff42117d3a17feb321062237fe](https://github.com/lively-community/lively/tree/25a0a5f4ed1988ff42117d3a17feb321062237fe)
- 许可证：[GPL-3.0](https://github.com/lively-community/lively/blob/25a0a5f4ed1988ff42117d3a17feb321062237fe/LICENSE)。
- 已核实：README 列出互动网页壁纸、开发者 API、硬件/音频等信息来源，以及全屏应用运行时暂停壁纸的策略。
- 借鉴到花园：低干扰常驻、全屏暂停、用户可配置的活动强度、环境层与工作层的区分。
- 边界：壁纸位于桌面背景，始终可见的覆盖层在窗口上方；窗口贴附、全局输入和点击穿透必须单独验证。本版优先参考行为，不计划直接拼接 Lively 源码；未来若复用代码，另行核对其许可证与发布方式。

### 1.3 Patatap：让一个小动作获得完整音画反馈

- 原仓库：https://github.com/jonobr1/Patatap
- 作者演示：https://patatap.com/
- 核查快照：[4189468dcbb06e3bd520976c62fc3a85377ecf89](https://github.com/jonobr1/Patatap/tree/4189468dcbb06e3bd520976c62fc3a85377ecf89)
- 许可证依据：[README 声明 MIT](https://github.com/jonobr1/Patatap/blob/4189468dcbb06e3bd520976c62fc3a85377ecf89/README.md)；GitHub 元数据未识别出独立许可证，不把缺省字段当成无许可或完整素材授权。
- 已核实：[src/index.js](https://github.com/jonobr1/Patatap/blob/4189468dcbb06e3bd520976c62fc3a85377ecf89/src/index.js) 有键盘事件与不同按键映射；项目将短动画与声音结合。
- 借鉴到花园：造园模式里的键盘乐器、拨花发声、用输入节奏组成花园乐句。
- 边界：全屏按键演奏不等于后台桌面输入；本项目需明确获得焦点后才拦截演奏按键。合成我们自己的音色，不直接搬运原音频素材。

### 1.4 WebGL Fluid Simulation：连续的风、水与花粉反馈

- 原仓库：https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
- 作者演示：https://paveldogreat.github.io/WebGL-Fluid-Simulation/
- 核查快照：[a2d292931f19d9b3b9f564e23e6c32729d2121c3](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/tree/a2d292931f19d9b3b9f564e23e6c32729d2121c3)
- 许可证：[MIT](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/a2d292931f19d9b3b9f564e23e6c32729d2121c3/LICENSE)。
- 已核实：项目提供浏览器中的交互流体模拟；[script.js](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/a2d292931f19d9b3b9f564e23e6c32729d2121c3/script.js) 包含鼠标/触摸输入、扰动注入及流场更新。
- 借鉴到花园：指针方向决定风向，声音特征决定力度；同一风场影响草叶、花粉、水面。快速转圈形成局部涡流。
- 边界：首版可用简化向量场，不必完整移植模拟；流体视觉、植物受力和种子落地需要不同的状态逻辑。真实设备上的性能尚未测试。

### 1.5 Meyda：把声音转成可设计的参数

- 原仓库：https://github.com/meyda/meyda
- 核查快照：[ecf256616d43292c82cbf96e60a91b19ca10eb64](https://github.com/meyda/meyda/tree/ecf256616d43292c82cbf96e60a91b19ca10eb64)
- 许可证：[MIT](https://github.com/meyda/meyda/blob/ecf256616d43292c82cbf96e60a91b19ca10eb64/LICENSE.md)。
- 特征说明：[docs/audio-features.md](https://github.com/meyda/meyda/blob/ecf256616d43292c82cbf96e60a91b19ca10eb64/docs/audio-features.md)。
- 已核实：支持离线和基于 Web Audio 的实时音频特征提取。RMS 用于强度描述，谱质心描述声音明亮程度，频谱平坦度反映噪声性等。
- 借鉴到花园：音量包络控制开合，明亮程度控制颜色，噪声特征辅助吹风工具；采样后保存特征与合成声音参数。
- 边界：它不是现成声音来源分类器；起音检测、节奏聚类、哼唱音高跟踪需要额外逻辑与验证。只凭音量不能可靠区分吹气、说话和风扇声。

### 1.6 EZ-Tree：少量模板也能长出不同植物

- 原仓库：https://github.com/dgreenheck/ez-tree
- 核查快照：[dcf309bd86bd521083d9c70f01f2de45fdc7c457](https://github.com/dgreenheck/ez-tree/tree/dcf309bd86bd521083d9c70f01f2de45fdc7c457)
- 许可证：[MIT](https://github.com/dgreenheck/ez-tree/blob/dcf309bd86bd521083d9c70f01f2de45fdc7c457/LICENSE)。
- 已核实：README 描述基于 JavaScript/Three.js 的参数化树木生成、可复现随机种子、多项枝叶参数以及可调用的生成库。
- 借鉴到花园：植物使用“模板 + 生成种子 + 少量声音参数”；同一株植物保存后可复现，子株能继承部分参数。
- 边界：这是树木生成器，不能宣称现成提供花卉、声音种植或传粉。首版若采用二维/2.5D，可以只参考生成方法，不引入整个库。

## 2. 两个可选技术支撑

| 项目 | 已核实的用途 | 在本项目中的候选用途 | 许可证与快照 |
| --- | --- | --- | --- |
| [Tone.js](https://github.com/Tonejs/Tone.js) | Web Audio 音乐框架，包含音色、效果、时间调度 | 风路演奏、合成铃铛音、播放控制；简单音效也可直接使用 Web Audio | [MIT / de9df332ca7573b90a9aaca10c0729a3091dda0a](https://github.com/Tonejs/Tone.js/tree/de9df332ca7573b90a9aaca10c0729a3091dda0a) |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe) | 手部关键点等视觉能力 | 后续验证捏合拿起、松开种植；普通取色无需模型 | [Apache-2.0 / 800a56cc5004f6b0b0bb65134cc6c2ec12f0c88f](https://github.com/google-ai-edge/mediapipe/tree/800a56cc5004f6b0b0bb65134cc6c2ec12f0c88f) |

MediaPipe 的手部接口与性能建议参见 [官方 Web 指南](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)。模型文件、依赖和发布包仍需按实际引入版本核对；不把仓库许可证概括为所有外部素材的授权。

## 3. 借鉴后的原创组合

### 组合 A：一只杯子成为一株花

敲杯子采样 → 音频特征生成铃铛花 → 可选摄像头取杯身颜色 → 鼠标拨动发出合成节奏 → 保存。

从 Meyda 学特征表达、从 Patatap 学反馈配对、从参数化生成学可复现形态。杯子与植物的对应关系是本项目设计。

### 组合 B：把花园变成可演奏的空间

摆放植物 → 画一条风路 → 风经过时依次触发花朵 → 移动植物改变演奏 → 保存为微气候瓶。

从流体模拟学连续反馈、从音频框架学时间调度。用空间布局编辑音乐是本项目的组合方向。

### 组合 C：工作时的细雨，停下来后的花开

真实桌面键盘活动 → 聚合强度 → 低幅度雨滴 → 停止输入后天气回落 → 安静时植物开放。

从 BongoCat 学真实输入反馈、从 Lively 学日常运行策略。不用工作量评价用户，也不奖励持续打字。

## 4. 参考取舍

- 优先验证 BongoCat 类桌面输入路线与我们的麦克风体验；桌面能力通过后再增加视觉复杂度。
- Patatap 与流体模拟主要提供“动作到反馈”的设计参考，不把原有完整画面当我们的最终产品。
- 首版两种植物已足够验证生成和组合，不因 EZ-Tree 功能多就增加完整三维树木编辑器。
- 摄像头手势、系统音频、跨窗口藤蔓各自有独立边界，放在首版之后。
- 本轮只提交原创计划和出处链接；正式引入代码或素材时记录版本、文件来源、许可证及必要的通知文本。
