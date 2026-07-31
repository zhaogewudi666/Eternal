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
  transparent native window and transparent page canvas. Dark mode uses
  macOS-native neutral black/gray surfaces and system semantic colors; do not
  introduce a purple tint into dark UI surfaces or selection states.
- Keep the product to capture, search, keyboard navigation, complete/restore,
  reminders, confirmed task deletion, completed history, a configurable global
  shortcut, and light/dark/system theme selection.
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
  statistics, full calendar pages, autostart, telemetry, or update services.
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
