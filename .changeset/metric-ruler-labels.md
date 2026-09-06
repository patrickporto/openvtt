---
"@openvtt/canvas-plugin-measure": minor
---

Add multi-metric ruler labels to `@openvtt/canvas-plugin-measure`: the measure tool now converts grid-cell distances into any number of simultaneous units (e.g. `30 ft · 9 m`). Metrics are Valibot-validated (`perCell`, `suffix`, `precision`) with built-in presets (`cells`, `dnd5e`, `metric`, dual `dnd5e-metric`) and a public `MeasurePlugin` API (`setMetrics`, `setSeparator`, `setOptions`, `metrics`, `options`). The `measure` bus event gains a `metrics` array (raw values plus formatting metadata) and a ready-to-render `label` that matches the ruler exactly. Whole-cell values now trim the trailing `.0` (`12 u` instead of `12.0 u`), matching the ranges plugin label style. The playground defaults to the dual preset and demos live switching via a Units selector.
