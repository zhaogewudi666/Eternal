# Eternal Design QA

Result: **passed**

## Comparison inputs

- Reference: `design/references/native-dark-reference.png`
- Implemented dark panel: `design/qa/implementation-dark.png`
- Side-by-side review: `design/qa/reference-vs-implementation-dark.png`

## Verified visual criteria

- Compact native-style header, persistent quick-capture field, dense task rows,
  quiet borders, restrained radii, and system typography match the reference
  direction.
- Unfinished tasks render first. A clearly labeled `已完成` section follows in
  the same scrollable panel, with quieter completed rows and strike-through
  titles.
- The 380 × 560 panel keeps search, settings, the task list, and keyboard help
  visible without clipping.
- Dark and light themes preserve the same hierarchy and spacing. Accent color
  is limited to the Eternal mark, selection/completion, and actionable state.
- Search, settings, theme switching, shortcut display, reminders, and the
  stacked task sections were inspected in the local browser preview.

## Intentional differences from the reference

- Eternal keeps its infinity/check brand instead of copying the reference
  title and bottom navigation.
- The desktop utility uses a shorter 380 × 560 window and a fixed keyboard-help
  footer; the reference image is a taller mobile-like composition.
- Completed titles use strike-through because completion by crossing an item
  out is part of Eternal's requested behavior.
