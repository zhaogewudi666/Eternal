# Eternal Design QA

final result: passed (0.2.3 final-review-fixes; both installers rebuilt from post-fix source)

## Source truth

- Visual direction: `design/native-ui-direction.md`
- Native dark reference: `design/references/native-dark-reference.png`
- Root-cause audit (pre-fix): `design/audit-2026-08-01/`
- Authoritative product constraints: `app/AGENTS.md`

## 0.2.3 corner root cause

| Step | Evidence |
|------|----------|
| Symptom | Tiny square corners / rectangular edge on the frameless rounded panel |
| Observation | CSS already used transparent `body`/`#root`, `border-radius: 14px`, `overflow: hidden`; Tauri window was `transparent: true` + `macOSPrivateApi` |
| Discriminating check | Tauri `WindowConfig.shadow` defaults to `true`. Undecorated + shadow paints a rectangular OS frame/shadow (and on Windows a 1px white border) independent of CSS radius. Full-bleed CSS `box-shadow` also composites as a rectangular layer over transparent corners |
| Confirmed root cause | Native window shadow remained enabled on a CSS-rounded transparent window; rectangular compositor edge leaked at the four corners |
| Fix | `shadow: false` in `tauri.conf.json`; transparent `html`/`body`/`#root`; shell keeps 14px radius + 1px border; remove full-bleed panel `box-shadow` |

## 0.2.3 keyboard flow (RED → GREEN)

| Behavior | RED | GREEN |
|----------|-----|-------|
| ArrowDown enters first unfinished | selected second row first | first unfinished selected |
| ArrowUp from first row → capture/search | wrap / trap in list | focus returns to active field |
| No list wraparound | modulo wrap | clamp / exit above first |
| Plain `/` opens search | no search / slash inserted | search focused, value empty |
| Spontaneous typing from row | (existing) | inserts into capture/search |
| Footer routes | still showed ⌘F / ↑↓ only | `↓ 列表`, `/ 搜索`, `↑ 输入` / `↑ 搜索` |
| Slash from focused button | swallowed / ignored | opens search |
| Printable from non-editable control | ignored | returns to capture/search |
| ArrowDown after capture re-focus | could land on stale second row | always first visible row |
| Missing filtered selection + ArrowDown | force 0 then +1 → row 1 | `moveSelection(-1, +1)` → row 0 |
| Search footer before result selected | advertised Space | only `↓ 结果` / `Esc` |
| Panel-shown after overlay | stuck in settings/search | reset to normal capture |
| Focused native-activate + ArrowDown then Space/Enter | Space/Enter activated old button | blur stale control; Space toggles task, Enter opens reminder |

## 0.2.3 silent autostart (RED → GREEN)

| Behavior | RED | GREEN |
|----------|-----|-------|
| Plugin args | `None` | `--autostart` on macOS LaunchAgent + Windows |
| Initial show_panel | always called → focus steal | skipped when `should_show_initial_panel(args)` is false |
| Arg parse / show decision | source-string only | production helpers + unit tests |
| Exact Cargo pin | caret `"2.5.1"` | exact `"=2.5.1"` |
| Pending across close/reopen | reset in-flight; duplicate enable | one OS call; pending preserved |
| Read failure / unknown / loading | fabricated false/off switch (`aria-checked=false`) | no operable switch; loading status or error + 重试; switch only after boolean OS read |
| Enable/disable success & failure | partial | commit only confirmed; rollback + inline error |
| Enter on switch | missing | same transaction as click; Space native |
| panel-shown event | none | emitted from real `show_panel`; frontend resets capture |

## Automated suite counts (final-review-fixes)

| Suite | Result |
|-------|--------|
| Frontend vitest | **142 passed** / 7 files (includes unknown-state + focused-button Space/Enter regressions) |
| Sites worker | `npm run test:sites` (4 passed) |
| Rust unit tests | `cargo test` (54 passed) |
| Rust format | `cargo fmt --all -- --check` |
| Rust clippy | `cargo clippy --all-targets --all-features -- -D warnings` |
| Frontend production build | `npm run build` |

## Historical 0.2.1 / 0.2.2

Geometry and stacked list hierarchy remain the baseline; 0.2.3 supersedes footer copy, list wraparound, ArrowUp exit, `/` search, native shadow policy, and silent autostart. See prior sections in git history for 0.2.1 browser PNGs and 0.2.2 interaction groups.

## Packaging (final artifacts)

Artifacts under `releases/0.2.3/` rebuilt from **post final-review-fixes** source (2026-08-01). macOS DMG replaced the earlier nonstandard binary-patched image with a **standard Tauri end-to-end DMG** (no offset replace / no manual payload injection):

| Artifact | Build path | Verification |
|----------|------------|--------------|
| `Eternal-0.2.3-Windows-x64-Setup.exe` | `npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis --ci` with writable `CARGO_HOME` + `XWIN_CACHE_DIR` under `app/src-tauri/target/` | Unchanged final NSIS; `file` → PE32; size 3820697; SHA256 `2cc81d7630083171d87c477583915464498c0a5afeb9eeda5da7bb49c04905bf` |
| `Eternal-0.2.3-macOS-arm64.dmg` | From repo root `app/`: `npm run tauri -- build --bundles dmg --ci` (Vite frontend + release `app` + ad-hoc sign identity `-` + `bundle_dmg.sh` / `hdiutil create`) | `hdiutil verify` VALID; mount layout `Eternal.app` + `Applications` symlink; mounted app **byte-identical** to standard source `target/release/bundle/macos/Eternal.app` (`diff -rq` + full file SHA256); `codesign --verify --deep --strict` OK source + mounted; arm64; version 0.2.3; `LSUIElement=true`; binary markers `index-C9aEWc-h.js`, `panel-shown`, `--autostart`; `file` → zlib compressed data; size 7235979 |
| `SHA256SUMS` | regenerated after standard DMG copy; Windows line preserved | `shasum -a 256 -c SHA256SUMS` both OK |
| `INSTALL.zh-CN.md` | install notes for unsigned test packages | present |

SHA256 (final):

```
caf1deecdccf48eeb1fd969206ec13d6fe0b710aecfd62214740d3b29ebc597b  Eternal-0.2.3-macOS-arm64.dmg
2cc81d7630083171d87c477583915464498c0a5afeb9eeda5da7bb49c04905bf  Eternal-0.2.3-Windows-x64-Setup.exe
```

Notes:

- Both packages remain **unsigned** test builds (ad-hoc macOS signing identity `-`; Windows signing skipped on non-Windows host).
- macOS DMG is the standard Tauri UDZO image (app + Applications link). No binary-offset payload patching; Code Resources match the signed source app.
- Packaged Mach-O SHA256 `05398d4df6a904179a36c4d20f900203e702b6e670a64145fffbcc8b2c238db5` (source app and mounted app identical).
- Gatekeeper “right-click Open” remains the expected path for unsigned local builds.
- No DMG-pending claim remains: both installers are present, hashed, and traced to final-source binaries via standard bundling.
