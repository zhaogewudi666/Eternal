# Eternal v0.2.9

本地优先、键盘优先的轻量待办面板：全局快捷键唤出，用完即隐，Windows 托盘 / macOS 菜单栏常驻。

## 本版亮点

- **Windows 自动更新（国内可用）**：更新源已切换为 Gitee 优先、GitHub 兜底，国内客户可直接检查更新并全自动安装（下载 → 静默安装 → 自动重启）
- 延续 v0.2.8 的全部改进：主面板 `⌘E` / `Ctrl+E` 编辑标题、点击展开全文、长文本完整显示

## 下载

| 平台 | 架构 | 文件 |
|------|------|------|
| Windows 10/11 | x64 | `Eternal-0.2.9-Windows-x64-Setup.exe` |
| macOS | Apple Silicon (arm64) | `Eternal-0.2.9-macOS-arm64.dmg` |

## 校验与签名

```bash
shasum -a 256 -c SHA256SUMS
```

- **Windows**：未代码签名。若 SmartScreen 提示拦截，核对哈希后可「更多信息」→「仍要运行」
- **macOS**：仅 ad-hoc 签名。首次打开被拦截时右键应用 →「打开」

## 请你本机确认

Windows 自动更新请在真实设备上冒烟验证（设置 → 软件更新 → 检查更新），确认 Gitee 源在国内网络下可达。

---

任务与设置保存在本机。无账号、无云同步、无遥测。
