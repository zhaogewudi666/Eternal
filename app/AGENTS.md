# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Eternal product constraints

- This folder is the real Tauri desktop application frontend, not a disposable
  website mockup.
- `../design/references/native-dark-reference.png` is the current visual
  reference; `../design/native-ui-direction.md` records the binding
  interpretation for the desktop popover.
- Prefer system fonts, compact neutral surfaces, restrained radii, native
  controls, and low decoration. Do not add glass blur, glow, marketing
  gradients, oversized cards, or AI-looking ornamental chrome.
- Keep the outer frameless window genuinely rounded by preserving the
  transparent native window and transparent page canvas (`html`/`body`/`#root`).
  Disable the native window shadow (`shadow: false`) so the OS does not paint a
  rectangular frame/shadow into the CSS-transparent corners; the panel uses a
  14px radius, overflow clip, and a 1px border for separation without a full-
  bleed external box-shadow. Dark mode uses macOS-native neutral black/gray
  surfaces and system semantic colors; do not introduce a purple tint into dark
  UI surfaces or selection states.
- Keep the product to capture, search, keyboard navigation, complete/restore,
  reminders, confirmed task deletion, completed history, a configurable global
  shortcut, and light/dark/system theme selection.
- Keyboard-first flow is “open, act without thinking, close”: the global
  shortcut opens and focuses capture; normal typing captures immediately; every
  state has an obvious key back; Esc eventually hides the panel and restores the
  previous app. ArrowDown from capture enters the first unfinished row (or first
  completed if none). In list navigation, ArrowUp/ArrowDown do not wrap; ArrowUp
  on the first row returns focus to the active text field (capture or search).
  Printable characters (no Command/Ctrl/Alt) from a selected row focus that
  field and insert the character—do not steal Space, Enter, Backspace/Delete,
  Escape, or IME composition. Plain `/` outside an editable control opens search
  without inserting the slash. Row actions remain Space complete/restore, Enter
  reminder, Backspace/Delete delete confirmation (Enter confirm / Esc cancel).
  After complete/restore/delete, selection always lands on a logical neighbor or
  capture—never nowhere.
- Unfinished and completed tasks share one scrollable panel: unfinished rows
  first, then a clearly labeled `已完成` section below. There is no exclusive
  todo/completed view and no top segmented switch. Capture stays available in
  the normal panel. Search spans both sections and labels each result's state.
  `CommandOrControl+1` / `CommandOrControl+2` jump selection between the
  unfinished and completed sections without reintroducing exclusive views.
- The global shortcut is validated, normalised, and rebound in Rust
  (`src-tauri/src/shortcut.rs`); the frontend only captures and renders it.
  A rebind is transactional: a rejected or conflicting combination must leave
  the previously registered and persisted shortcut untouched.
- Do not add accounts, sync, collaboration, AI, projects, tags, priorities,
  statistics, full calendar pages, telemetry, or update services.
- Autostart is authorized only as the official Tauri v2 autostart plugin
  (`tauri-plugin-autostart` / `@tauri-apps/plugin-autostart` exact 2.5.1,
  Cargo `=2.5.1`), initialized with `MacosLauncher::LaunchAgent` and the
  dedicated `--autostart` argument on both macOS and Windows, and granted only
  `autostart:allow-enable` / `autostart:allow-disable` /
  `autostart:allow-is-enabled`. Do not add custom registry or LaunchAgent code.
  The Settings switch “开机时启动 Eternal” is opt-in (default off); OS
  registration is the source of truth; enable/disable is transactional; and
  autostarted launches must stay silent: tray/reminders/shortcut still init,
  but skip initial `show_panel`/focus (`visible: false`, no Dock/taskbar
  steal). Manual launch still shows the panel; later show uses an explicit
  `panel-shown` signal to reset capture.
- macOS must remain usable from the menu bar without a Dock icon. Windows must
  remain usable from the system tray after the panel is hidden.
- Keep the visible brand lockup compact: `Eternal` plus a small monochrome
  continuous ribbon and check. The subtitle identifies the current Inbox view
  and unfinished count; do not add a splash screen or decorative brand card.
- The app and installer icon uses the same infinity-ribbon/check symbol on a
  mature dusk-indigo and restrained lavender-blush background. Keep it
  romantic and refined without literal hearts, mascots, flowers, or ornamental
  AI-style detail.
- The frameless header is the native drag region. Search and settings remain
  ordinary clickable controls outside that drag region, and the last safe
  window position must survive relaunches.
- Reminder editor is fully keyboard-closable: Tab reaches datetime, repeat,
  presets, and save/cancel; Enter saves a valid future time; Esc cancels without
  persistence. Footer while open: `Tab 切换` / `Enter 保存` / `Esc 取消`. Enter
  must not silently save while a native `<select>` is choosing an option.
- Reminder presets (`15 分钟` / `1 小时` / `今晚` / `明天`) only fill the local
  datetime field; they never persist until Enter or 保存. Tonight is the next
  local 20:00 (today if still ahead, else tomorrow). Tomorrow is the next local
  calendar day at 09:00. Full datetime + repeat remain available.
- Completing an unfinished task selects the next unfinished neighbor; else the
  previous unfinished; if none remain, clear selection and focus capture.
  Restoring a completed task keeps selection on that task in the unfinished
  section. Toggle failures leave the list and selection unchanged.
- Completion feedback is restrained: checkbox and strike update immediately,
  then the row migrates after 160 ms (complete) or 120 ms (restore), with no
  bounce. `prefers-reduced-motion` commits immediately. Duplicate toggles during
  the transition are ignored; timers clear on unmount.
- Footer hints are context-specific and uncluttered: capture shows Enter add,
  ↓ 列表, / 搜索, section jumps, Esc; a keyboard-selected row shows Space
  complete/restore, Enter reminder, ⌫ delete, ↑ 输入, Esc; search shows ↓ 结果
  (and ↑ 搜索 when a result is selected); reminder/delete/settings/recording each
  show only valid actions. Platform modifier labels stay correct (`⌘` on macOS,
  `Ctrl+` elsewhere).
