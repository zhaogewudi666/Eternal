# Eternal 0.2.3 安装说明

## 目标平台

| 安装包 | 架构 | 说明 |
|--------|------|------|
| `Eternal-0.2.3-macOS-arm64.dmg` | Apple Silicon（arm64） | 标准 Tauri 端到端 DMG（`tauri build --bundles dmg`，无二进制补丁）；含 Eternal.app 与 Applications 快捷方式；载荷为 final-review-fixes 后当前源码 |
| `Eternal-0.2.3-Windows-x64-Setup.exe` | Windows x64 | NSIS 当前用户安装，无需管理员权限；由 final-review-fixes 后源码经 cargo-xwin 交叉编译打包 |

两个安装包均为**未签名**测试包。请先用 `SHA256SUMS` 校验完整性，再安装。

## Windows 10/11 x64

1. 运行 `Eternal-0.2.3-Windows-x64-Setup.exe`。
2. 安装程序会为当前 Windows 用户安装 Eternal，不需要管理员权限。
3. 本测试包未购买代码签名证书。如果 Microsoft Defender SmartScreen 显示“Windows 已保护你的电脑”，请先核对 `SHA256SUMS`，然后选择“更多信息”→“仍要运行”。
4. Windows 10/11 通常已包含 WebView2。如果系统缺少它，安装器内置的 Microsoft 引导程序可能需要联网下载运行时。

## macOS Apple Silicon

1. 打开 `Eternal-0.2.3-macOS-arm64.dmg`，把 Eternal 拖入“应用程序”（或镜像内的 Applications 入口）。
2. 本地包未使用 Apple Developer ID 签名，也未公证。第一次打开如果被 macOS 拦截，可右键点击 Eternal 后选“打开”，或在“系统设置”→“隐私与安全性”中选择“仍要打开”。
3. 这个安装包仅适用于 Apple Silicon（M1/M2/M3/M4 系列）Mac。

本目录中的 macOS DMG 与 Windows NSIS 安装包均由 **0.2.3 final-review-fixes 后的当前源码** 生成（含静默 autostart、未知态不渲染假关开关、键盘焦点清理）。macOS 包为标准 Tauri DMG（非 offset/payload 补丁产物）。请使用本目录 `SHA256SUMS` 校验，不要复用修复前或补丁版 DMG 的哈希。

## 0.2.3 要点

- **圆角无边框窗口**：`shadow: false` + 透明画布，面板 14px 圆角。
- **键盘流**：↓ 进入列表、↑ 回到捕获/搜索、不环绕、`/` 搜索（含按钮焦点）、行内可直接打字；从 focused 按钮 ↓ 进入列表后 Space/Enter 作用于高亮任务。
- **开机时启动 Eternal**（设置内开关，默认关闭）：
  - 官方 Tauri v2 autostart 插件 **2.5.1**（Cargo exact `=2.5.1`）；macOS `LaunchAgent`；注册参数 `--autostart`。
  - 开机自启**静默**：初始化托盘/快捷键/提醒，但**不**调用初始 `show_panel`/抢焦点。
  - 手动启动仍会显示面板；托盘/快捷键唤出时前端收到 `panel-shown` 并回到捕获。
  - OS 注册为真相源；开关事务化；失败保留原状态；读取中/失败时**不**渲染假关开关，仅状态/错误 + 重试。
- 默认全局快捷键：`Command/Ctrl + Shift + Space`。可在设置中改绑；录制时 `Esc` 取消录制。
- macOS 从菜单栏、Windows 从系统托盘重新打开或退出 Eternal。

## 校验安装包

在 `releases/0.2.3/` 目录：

```bash
shasum -a 256 -c SHA256SUMS
```

传输到另一台电脑后，请先确认计算结果与 `SHA256SUMS` 一致。

## 已知限制

- 安装包未签名、未公证；Gatekeeper / SmartScreen 警告预期内。
- 本包未在实体设备上完成登录自启 / Gatekeeper / SmartScreen 点选验收；请在本机验证。
- macOS 包仅 arm64；Windows 包为 x64 NSIS。
- 实体登录自启冒烟测试留给用户。
