# Eternal Design QA

final result: passed

## Source truth

- Visual direction: `design/native-ui-direction.md`
- Native dark reference: `design/references/native-dark-reference.png`
- Root-cause audit (pre-fix): `design/audit-2026-08-01/`
- Authoritative product constraints: `app/AGENTS.md`

## Implementation screenshot evidence (Codex in-app browser)

Full-panel captures from the rendered 0.2.1 UI (not jsdom-only):

| State | Full panel | Focused crop |
|-------|------------|--------------|
| Light normal | `design/qa/v021-light-normal-full.png` | `design/qa/v021-light-normal.png` |
| Light selected row | `design/qa/v021-light-selected-full.png` | — |
| Reminder editor | `design/qa/v021-reminder-full.png` | `design/qa/v021-reminder.png` |
| Delete confirmation (pre-fix P2) | `design/qa/v021-delete-confirm-full.png` | `design/qa/v021-delete-confirm.png` |
| Delete confirmation (post-fix) | `design/qa/v021-delete-confirm-postfix-full.png` | `design/qa/v021-delete-confirm-postfix.png` |
| Dark default | `design/qa/v021-dark-default-full.png` | `design/qa/v021-dark-default.png` |
| Reference vs dark | `design/qa/v021-reference-vs-dark-default.png` | — |

Secondary structural HTML (non-authoritative for pixels):

- `design/qa/v021-light-normal.html`
- `design/qa/v021-dark-normal.html`
- `design/qa/v021-reminder.html`
- `design/qa/v021-delete-confirm.html`

## Browser-rendered viewport / states

- Viewport target remains **380 × 560**. Captures show the compact frameless panel without clipped header, capture field, list actions, or footer.
- **Light normal**: unfinished rows above, `已完成` section below; every row exposes a quiet bell and trash control; footer teaches `⌘1/2` / `⌘F` / arrows / Space / Esc.
- **Light selected**: selected unfinished row gains a soft lavender selection fill; footer becomes context-aware (`Enter 提醒`, `⌫ 删除`).
- **Reminder**: popover editor over the list with title, datetime, repeat, and save/remove actions; list and footer remain in the same panel.
- **Delete confirmation (post-fix)**: dialog titled `删除任务` with description only in the header and bottom actions **exactly** `取消` + `删除` (no top-right cancel, no `保留`). Autofocus on `删除`; footer `Enter 确认删除` / `Esc 取消`. No clipping at 380×560. Modal semantics: `role="dialog"`, `aria-modal="true"`.
- **Dark default**: same hierarchy and spacing on warmer dusk neutrals with periwinkle accents; reminder metadata and completed quieting remain readable.

## Full comparison

- Side-by-side: `design/qa/v021-reference-vs-dark-default.png` (left reference, right Eternal dark implementation).
- Shared: stacked unfinished → completed list, dense rows, compact capture, quiet surfaces, system-like density.
- Intentional product differences from the mobile reference: Eternal infinity/check brand, 380×560 desktop utility chrome, fixed keyboard-help footer, always-visible reminder bells, quieter trash affordances, strike-through completed titles, no bottom three-tab navigation.

## Focused reminder / delete states

- **Reminder**: `v021-reminder-full.png` / `v021-reminder.png` — bell affordance opens the existing editor; reminded rows keep time/repeat metadata.
- **Delete pre-fix**: `v021-delete-confirm-full.png` / `v021-delete-confirm.png` — showed redundant cancel paths (P2).
- **Delete post-fix**: `v021-delete-confirm-postfix-full.png` / `v021-delete-confirm-postfix.png` — single cancel + one destructive confirm; compact overlay; no clipping.

### Pre-fix P2 (observed in Codex browser capture)

`v021-delete-confirm-full.png` and `v021-delete-confirm.png` show **two cancellation paths**: top-right `取消` and bottom-left `保留`, plus bottom-right `删除`.

### Post-fix visual evidence (Codex browser re-capture)

After simplifying the dialog:

1. Header is title + description only (no top-right cancel).
2. Bottom row is only `取消` and `删除`.
3. DOM: one dialog named `删除任务` with exactly those two actions.
4. Captures: `v021-delete-confirm-postfix-full.png` and `v021-delete-confirm-postfix.png` confirm no clipping at 380×560.
5. Automated tests keep asserting dialog role, modal semantics, single cancel, and no `保留`.

## Interaction checks

| Interaction | Evidence |
|-------------|----------|
| Bell on tasks without reminders | Light/dark full captures; row “设置提醒” control |
| Bell/metadata on reminded tasks | Dark default + light selected (time / “每 30 分钟”) |
| Enter opens reminder when row selected | Footer context help + reminder overlay capture |
| Trash / Delete opens confirmation | Post-fix delete full capture + tests |
| Enter confirms delete | Behavior tests (`safe task deletion`) |
| Esc / single 取消 cancels | Post-fix PNG + behavior tests |
| Completed-task delete path | Behavior tests |
| Selection after cancel/delete | Behavior tests |
| Light + dark readable | Full PNGs above |
| No clipped controls at 380×560 | Full-panel PNGs including post-fix delete |

## Source / implementation notes

- Reminder affordance: always-on `.reminder-control`; search and completed rows keep it.
- Delete path: Rust `delete` + `delete_task` command + frontend bridge; confirmation required before persist; deleting removes any reminder with the task.
- Visual tokens: warmer neutrals + soft periwinkle/lavender-blush accents; no gradients, glass blur, glow, hearts, flowers, or decorative AI chrome.
- Phosphor icons and Eternal infinity/check brand preserved.

## Out of scope for this QA pass

- Platform-native installation / Gatekeeper / SmartScreen / tray behavior on physical devices was **not** claimed.
- Official macOS DMG packaging is performed by the integrator outside the worker sandbox (`hdiutil create` blocked here). Fallback ISO DMG is not recreated in finalization.

## History

1. **Initial 0.2.1 implementation QA**: structure + automated tests; browser PNG path incomplete in the worker environment.
2. **Codex browser inspection**: captured the real PNG set; flagged P2 duplicate cancel actions on delete confirm (`v021-delete-confirm*.png`).
3. **Acceptance correction**: simplified delete dialog to one `取消` + one `删除` with dialog semantics; tests GREEN.
4. **Post-fix browser re-capture**: `v021-delete-confirm-postfix-full.png` / `v021-delete-confirm-postfix.png` confirm the fixed UI with no clipping → **final result: passed**.
