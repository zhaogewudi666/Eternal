# Eternal Visual QA

**Status:** PASS

**Reference:** `design/references/native-dark-reference.png`  
**Implementation state:** `artifacts/qa/eternal-dark-final-380x560.png`  
**Combined comparison:** `artifacts/qa/native-reference-vs-implementation-final.png`

## Comparison state

- Dark appearance
- Quick-capture field focused
- No lingering list-selection highlight while capture owns focus
- Three active tasks
- Completed group collapsed
- Compact desktop panel at `380 × 560`

## Findings

- The implementation matches the reference's native direction: opaque neutral
  surfaces, system typography, square checkboxes, compact rows, restrained
  radii, and low-contrast separators.
- The original blue-tinted selection and focus treatment was reduced to
  neutral gray after the first comparison.
- Icons come from Phosphor rather than handcrafted SVG or CSS art.
- Both dark and light appearances were rendered and checked; the light theme
  retains contrast and hierarchy without adding decorative effects.
- Browser interaction checks covered capture after list navigation, completed
  search/restore, settings focus, reminder focus, and hierarchical `Esc`; the
  final production preview reported zero console errors.
- The compact footer contains only keyboard guidance. The reference's bottom
  navigation was intentionally omitted because Eternal has one unified
  workflow and no additional pages.

## Intentional differences

- Checkbox targets are slightly larger than the visual reference to preserve
  desktop pointer and keyboard accessibility.
- Search and appearance controls live in the header because they are part of
  the agreed single-panel workflow.
- Reminder metadata is shown inline only when a task has a reminder.

No clipped controls, broken spacing, decorative gradients, glass effects,
placeholder imagery, or inconsistent corner radii were found in the final
comparison.
