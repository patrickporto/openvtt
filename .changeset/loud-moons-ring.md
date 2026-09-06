---
"@openvtt/canvas-plugin-rings": minor
---

Add `@openvtt/canvas-plugin-rings`: concentric colored ring markers for
tokens on `@openvtt/canvas` — an extensible take on Owlbear Rodeo's
Colored Rings.

- `ring` document type (undo/redo + scene round-trip via `scene.rings`),
  rendered beneath tokens and synced per-frame to token drag/resize/hide.
- Valibot-validated styles: color, width, alpha, shape (circle/square),
  dash pattern, pulse animation, glow.
- Preset registry: 12 `COLOR_PRESETS`, semantic `CONDITION_PRESETS`
  (poisoned, bloodied, burning, blessed, frozen, ...), custom presets via
  constructor or `registerPreset`.
- Context menu: swatch grid with toggle state, custom color picker,
  batched clear — multi-select aware.
- `ringsBus()` typed port with `ring:added`/`ring:removed`/`rings:cleared`
  events and a `rings:resolve-style` syncWaterfall hook so other plugins
  (initiative trackers, condition managers) can restyle rings dynamically.
- Configurable layout (`spread` outward/inward, `gap`, `startInset`) with
  pure, tested geometry helpers (`ringSlots`, `dashedArcs`).
