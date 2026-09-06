---
'@openvtt/canvas': minor
'@openvtt/canvas-plugin-grid': minor
'@openvtt/canvas-plugin-grid-square': minor
'@openvtt/canvas-plugin-grid-hex': minor
'@openvtt/canvas-plugin-grid-isometric': minor
'@openvtt/canvas-preset-standard': minor
---

Grids are plugins now: one plugin per grid type.

- Core (`@openvtt/canvas`): `GridLayer` removed from the core. `canvas.grid`
  is now a `GridService` (state + snapping/cell math only) that emits a
  Valibot-validated `grid:change` event on every mutation (`set`, `setType`,
  `setSize`, `reset`); `canvas.draw()` applies `scene.grid` through it.
  `GridService` is exported and `GridLayer`/`GridLayerOptions` are no longer
  part of the public API. `GridRenderer.drawHex`/`drawIsometric` now honor
  `offsetX`/`offsetY` (previously only square did, which desynchronized
  rendering from snapping), and `ContextMenuToggle` supports an
  `indeterminate` state (dash) for mixed multi-selections.
- `@openvtt/canvas-plugin-grid`: base package with the reusable `GridLayer`,
  a `createGridTypePlugin({ type, ... })` factory (also `type: 'none'` for
  the toggle-only `gridNonePlugin`) and the grid context-menu builders
  (`gridMenuItems`, `GRID_TYPE_LABELS`). Each plugin registers a layer that
  is only visible while `canvas.grid.type` matches its own type, so
  `grid.setType()` switches between installed types and installing a
  single type keeps the bundle lean.
- Context menu: type toggles behave as a radio group (close on click, state
  always read from the `GridService` on open) including a "No grid" toggle;
  the active type contributes a separator plus live style controls — cell
  size, line width, opacity, color and Align X/Y offsets (all grid types,
  now that hex/isometric rendering honors offsets).
- `GridLayer` coalesces redraws with `requestAnimationFrame` — live slider
  dragging repaints the grid at most once per frame instead of once per
  input event.
- New per-type packages: `@openvtt/canvas-plugin-grid-square`
  (`gridSquarePlugin`), `@openvtt/canvas-plugin-grid-hex`
  (`gridHexVerticalPlugin`, `gridHexHorizontalPlugin`) and
  `@openvtt/canvas-plugin-grid-isometric` (`gridIsometricPlugin`).
- Standard preset now installs all four grid plugins plus `gridNonePlugin`
  (19 plugins total) and re-exports them plus the factory.
