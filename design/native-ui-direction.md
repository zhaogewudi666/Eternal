# Eternal 原生化 UI 方向

> 当前视觉优先级：本文件与 `design/references/native-dark-reference.png`
> 高于早期玻璃质感效果图；`design/final-ui-spec.md` 继续作为功能、布局和
> 键盘交互依据。布局以参考图的 stacked 单列表为准，不再使用互斥视图。

## 目标

Eternal 应当像操作系统自带的小工具，而不是网页仪表盘或 AI 生成的概念稿。
界面只服务于随手记录、查找、完成、提醒和关闭，不展示项目、标签、统计或
底部页面导航。

## 视觉原则

- 使用系统字体，不加载品牌展示字体。
- 不使用玻璃模糊、发光、彩色渐变、3D 卡片或大面积阴影。
- 面板、输入框和任务行采用低对比度层级与克制圆角。
- 一屏维持紧凑密度；任务行高约 `42–44 px`，主要间距使用 `8 / 12 / 16 px`。
- 交互强调色保持克制的 dusk-indigo / 系统蓝；提醒、逾期、完成状态按语义
  使用琥珀、红、绿。已完成行整体更安静（弱化字重与对比）。
- 图标使用平台感较强的线性图标库，不用 emoji、字符图标或手绘 SVG。
- 浅色和深色共享几何结构，但分别调色。
- 女性向气质来自比例、调色与抛光，不使用爱心、花朵、玻璃拟态或 AI 装饰。

## 面板结构

- 目标内容尺寸：`380 × 560 px`；持久控件不得被裁切。
- Header：约 `56–58 px`，左侧 compact Eternal 品牌与未完成计数，右侧搜索与设置。
- 快速输入：`44 px`，默认打开即聚焦；`Enter` 保存。始终出现在普通面板中。
- 列表：单一可滚动区域。未完成行在上方；其下是标注为「已完成」的分区，
  展示可恢复的已完成行。不再使用顶部「待办 / 已完成」分段控件，也不再使用
  底部折叠的已完成区。
- 搜索：覆盖未完成与已完成，并为每行标注「待办 / 已完成」。
- `⌘/Ctrl+1` 跳到未完成分区，`⌘/Ctrl+2` 跳到已完成分区；只移动选择与滚动，
  不切换互斥视图。
- 固定底部快捷键帮助：默认 `⌘/Ctrl+1·2`、`⌘/Ctrl+F`、`↑↓`、`Space`、`Esc`；
  键盘选中行时上下文显示 `Enter 提醒`、`⌫ 删除`。
- 每行都有可发现的提醒铃铛（无提醒时也显示安静铃铛）；垃圾桶在悬停/选中时更明显。
- 删除需经确认层：`Enter` 确认，`Esc` 取消；不提供撤销箱或批量删除。
- 不复制参考图的底部三栏导航。

## Dark Tokens (0.2.1 warmer neutrals + soft periwinkle)

- `--color-bg`: `#1D1A20`
- `--color-surface`: `#2A2530`
- `--color-surface-hover`: `#322C38`
- `--color-selected`: `#353040`
- `--color-border`: `#433C4A`
- `--color-text`: `#F4EEF5`
- `--color-text-secondary`: `#B3A9B8`
- `--color-text-muted`: `#918896`
- `--color-accent`: `#9AA0EA`
- `--color-success`: `#3DBA6E`
- `--color-reminder`: `#E0A85C`
- `--color-overdue`: `#FF6B78`

## Light Tokens (0.2.1 warmer neutrals + soft periwinkle)

- `--color-bg`: `#F4F2F6`
- `--color-surface`: `#FFFCFE`
- `--color-surface-hover`: `#F3EEF5`
- `--color-selected`: `#EBE4F0`
- `--color-border`: `#DDD4E0`
- `--color-text`: `#2A2430`
- `--color-text-secondary`: `#6A6270`
- `--color-text-muted`: `#847B88`
- `--color-accent`: `#6B6FD4`
- `--color-success`: `#2F8A52`
- `--color-reminder`: `#9A6B2F`
- `--color-overdue`: `#C23B4A`

## 平台行为

- macOS：菜单栏常驻；关闭面板不退出；不在 Dock 显示图标；托盘菜单保留
  “打开 Eternal”和“退出 Eternal”。
- Windows：系统托盘常驻；关闭面板不退出；任务栏不保留隐藏面板入口。
- 托盘点击和全局快捷键切换面板显示状态。全局快捷键默认
  `CommandOrControl+Shift+Space`，可在设置中改绑并持久化；macOS 显示为
  `⌘⇧Space`，Windows 显示为 `Ctrl+Shift+Space`。
- `Esc` 隐藏面板；面板失焦时隐藏；系统应尽可能把焦点交还给先前应用。
- 未提交草稿在应用进程存活期间保留。

## 明确排除

- 账户、同步、协作、AI、标签、项目、优先级、统计、完整日历页面。
- 开机自启动。
- 云端服务和遥测。
- 自动更新与发布流程。
