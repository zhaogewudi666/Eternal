# Eternal 0.2.2 安装说明

## 目标平台

| 安装包 | 架构 | 说明 |
|--------|------|------|
| `Eternal-0.2.2-macOS-arm64.dmg` | Apple Silicon（arm64） | 适用于 M1/M2/M3/M4 系列 Mac |
| `Eternal-0.2.2-Windows-x64-Setup.exe` | Windows x64 | NSIS 当前用户安装，无需管理员权限 |

两个安装包均为**未签名**测试包。请先用 `SHA256SUMS` 校验完整性，再安装。

## Windows 10/11 x64

1. 运行 `Eternal-0.2.2-Windows-x64-Setup.exe`。
2. 安装程序会为当前 Windows 用户安装 Eternal，不需要管理员权限。
3. 本测试包未购买代码签名证书。如果 Microsoft Defender SmartScreen 显示“Windows 已保护你的电脑”，请先核对 `SHA256SUMS`，然后选择“更多信息”→“仍要运行”。
4. Windows 10/11 通常已包含 WebView2。如果系统缺少它，安装器内置的 Microsoft 引导程序可能需要联网下载运行时。

## macOS Apple Silicon

1. 打开 `Eternal-0.2.2-macOS-arm64.dmg`，把 Eternal 拖入“应用程序”（或镜像内的 Applications 入口）。
2. 本地包未使用 Apple Developer ID 签名，也未公证。第一次打开如果被 macOS 拦截，可右键点击 Eternal 后选“打开”，或在“系统设置”→“隐私与安全性”中选择“仍要打开”。
3. 这个安装包仅适用于 Apple Silicon（M1/M2/M3/M4 系列）Mac。

## 0.2.2 键盘与交互要点

- **捕获**：`Enter` 添加任务；`⌘/Ctrl+1/2` 分区；`⌘/Ctrl+F` 搜索；方向键选择；`Esc` 关闭面板。
- **选中任务行**：`Space` 完成/恢复；`Enter` 打开提醒；`Delete` / `Backspace` 删除（需确认）；`Esc` 关闭面板。
- **提醒编辑器**：`Tab` 在控件间切换；`Enter` 保存有效未来时间；`Esc` 取消且不写入。底部提示为 `Tab 切换` / `Enter 保存` / `Esc 取消`。原生重复下拉在选择过程中不会被 `Enter` 误保存。
- **提醒预设**：`15 分钟` / `1 小时` / `今晚` / `明天` 只填充本地时间，需 `Enter` 或点“保存”才持久化。今晚 = 下一个本地 20:00；明天 = 次日本地 09:00。完整日期时间与重复仍可用。
- **完成导航**：完成未完成项后选中下一项未完成；否则上一项；若没有剩余则清空选择并回到捕获框。恢复已完成项时，选择停留在该项的未完成位置。
- **完成反馈**：勾选与删除线先更新，行迁移约 160 ms（完成）/ 120 ms（恢复）；系统开启“减少动态效果”时立即提交。
- **删除**：确认层中 `Enter` 删除，`Esc` 取消。
- 默认全局快捷键：`Command/Ctrl + Shift + Space`。可在设置中改绑；录制时 `Esc` 取消录制。
- macOS 从菜单栏、Windows 从系统托盘重新打开或退出 Eternal。

## 校验安装包

在 `releases/0.2.2/` 目录：

```bash
shasum -a 256 -c SHA256SUMS
```

传输到另一台电脑后，请先确认计算结果与 `SHA256SUMS` 一致。

## 已知限制

- 安装包未签名、未公证；Gatekeeper / SmartScreen 警告预期内。
- 本包未在实体设备上完成 Gatekeeper/SmartScreen 点选验收；请在本机按上述步骤处理未签名提示。
- macOS 包仅 arm64；Windows 包为 x64 NSIS。
