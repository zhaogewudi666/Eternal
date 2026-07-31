# Eternal 0.2.0 安装说明

## Windows 10/11 x64

1. 运行 `Eternal-0.2.0-Windows-x64-Setup.exe`。
2. 安装程序会为当前 Windows 用户安装 Eternal，不需要管理员权限。
3. 本测试包未购买代码签名证书。如果 Microsoft Defender SmartScreen 显示“Windows 已保护你的电脑”，请先核对 `SHA256SUMS`，然后选择“更多信息”→“仍要运行”。
4. Windows 10/11 通常已包含 WebView2。如果系统缺少它，安装器内置的 Microsoft 引导程序可能需要联网下载运行时。

## macOS Apple Silicon

1. 打开 `Eternal-0.2.0-macOS-arm64.dmg`，把 Eternal 拖入“应用程序”。
2. 本地包未使用 Apple Developer ID 签名，也未公证。第一次打开如果被 macOS 拦截，可右键点击 Eternal 后选“打开”，或在“系统设置”→“隐私与安全性”中选择“仍要打开”。
3. 这个安装包仅适用于 Apple Silicon（M1/M2/M3/M4 系列）Mac。

## 基本使用

- 默认全局快捷键：`Command/Ctrl + Shift + Space`。
- 未完成任务显示在上方，已完成记录固定显示在下方，可随时勾选恢复。
- `Command/Ctrl + 1` 跳到未完成分区，`Command/Ctrl + 2` 跳到已完成分区。
- `Command/Ctrl + F` 搜索，方向键选择，`Space` 完成或恢复任务。
- `Esc` 会按层级取消快捷键录制、关闭弹层、退出搜索，最后隐藏面板。
- 可在设置中修改全局快捷键，并选择跟随系统、浅色或深色外观。
- macOS 从菜单栏、Windows 从系统托盘重新打开或退出 Eternal。

## 校验安装包

`SHA256SUMS` 保存了两个安装包的 SHA-256。传输到另一台电脑后，请先确认计算结果与文件中一致。
