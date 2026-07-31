# Eternal Design QA

final result: passed (0.2.2 automated evidence)

## Source truth

- Visual direction: `design/native-ui-direction.md`
- Native dark reference: `design/references/native-dark-reference.png`
- Root-cause audit (pre-fix): `design/audit-2026-08-01/`
- Authoritative product constraints: `app/AGENTS.md`

## 0.2.2 UX acceptance (automated evidence only)

Five user-approved UX groups were implemented with RED→GREEN tests. Counts from
the final verification in this worker:

| Suite | Result |
|-------|--------|
| Frontend vitest | **107 passed** / 6 files |
| Sites worker | **4 passed** (`npm run test:sites`) |
| Rust unit tests | **51 passed** (`cargo test`) |
| Rust format | `cargo fmt --all -- --check` clean |
| Rust clippy | `cargo clippy --all-targets --all-features -- -D warnings` clean |
| Frontend production build | `npm run build` → `dist/client` + Sites packaging |

### Group evidence

1. **Reminder full keyboard closure**
   - RED: `ReminderEditor` Enter-save called 0 times; no preset buttons.
   - GREEN: Tab reaches controls; Enter saves valid time; Esc closes without
     `onSave`; Enter on focused `<select>` does not save; footer
     `Tab 切换` / `Enter 保存` / `Esc 取消`.

2. **Completion navigation**
   - RED: selection stayed on completed row after toggle.
   - GREEN: complete → next unfinished; last unfinished → previous; sole
     unfinished → clear selection + focus capture; restore keeps selection on
     restored unfinished row; toggle errors still surface without removing the
     row (existing safe-delete / toggle error paths preserved).

3. **Context-specific footer**
   - RED: capture footer still showed Space complete; reminder footer was only
     `Esc 关闭`.
   - GREEN: capture / selected-row / reminder / delete / settings / recording /
     search footers match `footerHintsForContext`; macOS `⌘` vs Windows `Ctrl+`.

4. **Reminder presets**
   - RED: no `15 分钟` / `1 小时` / `今晚` / `明天` controls.
   - GREEN: presets fill local datetime only (no silent persist); Enter confirms;
     pure helpers cover 15m, 1h, tonight (today 20:00 or tomorrow 20:00),
     tomorrow 09:00.

5. **Restrained completion feedback**
   - RED: row migrated immediately with selection glued to toggled id.
   - GREEN: checkbox/strike before section move; 160 ms complete / 120 ms restore;
     reduced-motion commits immediately; duplicate Space ignored in flight;
     unmount clears timers (fake-timer component tests).

## Historical 0.2.1 browser screenshot evidence

Full-panel captures from the rendered 0.2.1 UI (not jsdom-only). Geometry and
stacked list hierarchy remain the 0.2.2 baseline; footer copy and reminder
presets supersede the 0.2.1 footer strings in those PNGs.

| State | Full panel | Focused crop |
|-------|------------|--------------|
| Light normal | `design/qa/v021-light-normal-full.png` | `design/qa/v021-light-normal.png` |
| Light selected row | `design/qa/v021-light-selected-full.png` | — |
| Reminder editor | `design/qa/v021-reminder-full.png` | `design/qa/v021-reminder.png` |
| Delete confirmation (post-fix) | `design/qa/v021-delete-confirm-postfix-full.png` | `design/qa/v021-delete-confirm-postfix.png` |
| Dark default | `design/qa/v021-dark-default-full.png` | `design/qa/v021-dark-default.png` |
| Reference vs dark | `design/qa/v021-reference-vs-dark-default.png` | — |

## Browser-rendered viewport / states

- Viewport target remains **380 × 560**.
- Unfinished rows above, labeled `已完成` section below; capture always available.
- Dark tokens remain macOS-native neutrals (`#1C1C1E` / `#2C2C2E` / `#0A84FF`);
  transparent native window + `14 px` shell radius preserved.
- 0.2.2 does **not** claim new physical-device browser PNGs in this pass; UI
  behavior is covered by the automated suite above.

## Interaction checks (0.2.2)

| Interaction | Evidence |
|-------------|----------|
| Reminder Tab / Enter / Esc | `ReminderEditor.test.jsx` |
| Reminder presets fill only | `ReminderEditor.test.jsx` + `reminder-time.test.js` |
| Complete → next/prev unfinished | `App.test.jsx` completion navigation |
| Restore keeps selection | `App.test.jsx` |
| Context footers | `App.test.jsx` + `task-state.test.js` `footerHintsForContext` |
| 160/120 ms transition | `App.test.jsx` restrained completion feedback |
| Reduced motion immediate commit | `App.test.jsx` |
| Safe delete / Esc focus return | Existing `App.test.jsx` safe deletion suite |
| Platform modifier labels | Footer + shortcut format tests |

## 0.2.2 packaging evidence

Artifacts under `releases/0.2.2/`:

| File | Size | Notes |
|------|------|-------|
| `Eternal-0.2.2-macOS-arm64.dmg` | 7,279,316 bytes (~6.9 MiB) | UDZO; `hdiutil verify` VALID; embeds `index-DsgUJarr` |
| `Eternal-0.2.2-Windows-x64-Setup.exe` | 3,805,740 bytes (~3.6 MiB) | NSIS x64; PE Nullsoft installer; `app.exe` embeds `index-DsgUJarr` |
| `INSTALL.zh-CN.md` | install + keyboard/preset notes | |
| `SHA256SUMS` | both installers | `shasum -a 256 -c` OK |

macOS app (bundled inside DMG after mount):

- `diskutil image attach` mount shows `Eternal.app` + `Applications -> /Applications`
- `CFBundleShortVersionString` / `CFBundleVersion` = **0.2.2**
- Executable `Mach-O 64-bit arm64`
- Embedded frontend asset names from the post-footer-fix build (`index-DsgUJarr`, `index-DOwouRDQ`) present in binary
- Signing: adhoc/linker-signed only (`--no-sign`); not Developer ID / not notarized
- Search footer uses `Space 完成/恢复` (search spans unfinished + completed)

Windows:

- Built with `cargo-xwin` + `makensis` targeting `x86_64-pc-windows-msvc`
- `app.exe` is PE32+ x86-64; installer is NSIS x64 setup
- Unsigned (SmartScreen expected)

## Out of scope / limits

- Unsigned installers only; no Apple Developer ID notarization, no Windows
  Authenticode, no physical-device Gatekeeper/SmartScreen click-through proof.
- No new Codex in-app browser PNG set for 0.2.2 footers/presets in this worker
  pass; automated tests are the authoritative 0.2.2 behavior evidence.
- macOS DMG packaging used the established local toolchain with a write-blocked
  `hdiutil create` workaround (template UDRW binary/plist in-place update +
  `hdiutil convert`/`verify` + `diskutil image attach` content check).

## History

1. **0.2.1 implementation QA** through delete-dialog post-fix and native-black
   transparent window follow-up (see prior sections / `design/qa/v021-*`).
2. **0.2.2 UX five-group release**: reminder keyboard + presets, completion
   navigation, context footers, restrained toggle feedback; version bump and
   unsigned macOS arm64 + Windows x64 packages under `releases/0.2.2/`.
