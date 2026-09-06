---
'@openvtt/canvas-plugin-maps': minor
'@openvtt/canvas-preset-standard': minor
---

Add `@openvtt/canvas-plugin-maps`: streaming tiled map loading for
`@openvtt/canvas`, following the Warp Core approach (Owlbear Rodeo 2.3).

- `map` document type (Valibot-validated) with `image` (any URL/data URL) or
  `tiled` (`{z}/{x}/{y}` template + dimensions) sources; `scene.maps` and
  `scene.documents.map` hydration, resize/transform support and a context
  menu with opacity plus "Natural size" (undoable reset to the source
  dimensions), "Fill scene" (stretch to scene bounds) and "Fit view to map"
  actions with live hints.
- Image sources build a client-side mipmap pyramid (LOD levels until the
  largest edge fits one tile) by slicing `ImageBitmap`s on demand, so GPU
  memory stays bounded by the visible tiles; tiled sources stream
  server-rendered tiles directly.
- `TiledSprite` renders with viewport culling — only tiles intersecting the
  view are requested/drawn, coarse ancestors show as progressive fallback
  while fine tiles stream in, and off-screen tiles are pruned.
- `MapSourceRegistry` implements the flyweight pattern: maps sharing a
  source descriptor reuse one decoded pipeline and one LRU `TileCache`
  (bitmaps released on eviction); refcounted teardown.
- `map:progress` (fetch progress for image sources, per-tile progress for
  tiled sources), `map:loaded` (dimensions + LOD levels) and `map:error` bus
  events for loading UIs; failed maps render a placeholder instead of
  throwing.
- The standard preset installs `mapsPlugin` (below tiles, above background).
