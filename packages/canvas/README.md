# @openvtt/canvas

Framework-agnostic, PixiJS-powered game canvas for OpenVTT. Provides a Foundry-VTT-inspired API (`Canvas`, `CanvasLayer`, `PlaceablesLayer`, `PlaceableObject`) on top of PixiJS 8 + `pixi-viewport`, with no coupling to any UI framework.

## Architectural boundary

Pixi owns the scene tree; **no Pixi object ever leaves the canvas**. Everything that crosses the package boundary goes through `@openvtt/events` as **plain JSON**:

- Pointer/camera events → `{ x, y, scale, button, ... }`
- Object lifecycle → the same Valibot-validated data documents (`TokenData`, `TileData`, ...)
- `token:moved` → `{ id: string, x: number, y: number }`

This keeps the canvas consumable by any host (vanilla TS, React, a worker, a headless server) and makes every emitted payload directly compatible with `@openvtt/formula` (JSON-Logic-shaped) for downstream rules/automation.

## Adopted libraries

| Concern | Library | Where |
| --- | --- | --- |
| Identifiers | `uuid` v7 (`newId`) | all object/scene ids |
| Schema validation | `valibot` | `schemas.ts` (scene/token/tile/drawing/wall) |
| Events & hooks | `@openvtt/events` | `bus.ts` (`createCanvasBus`) |
| Camera | `pixi-viewport` 6 | `CanvasViewport` (pan/zoom/pinch/clamp/follow) |
| Spatial index | `rbush` 4 | `PlaceablesLayer` (`pick`, `pickRect` — O(log n) hit-testing) |
| Selection FX | `pixi-filters` 6 (`GlowFilter`) | `PlaceableObject.refreshSelection` |

> **`pixi-viewport` fork note:** the `@pixi-viewport/*` fork does not exist on npm (404). The live, Pixi-v8-compatible package is `pixi-viewport` (davidfig) `^6.0.3` — used here.

## Public API (Foundry-flavoured)

```
Canvas                         main controller (Application + viewport + layers + bus)
├─ background: BackgroundLayer
├─ grid: GridLayer             square / hex-v / hex-h / isometric, snapToGrid, getCellShape
├─ tiles: TileLayer            PlaceablesLayer<TileData, Tile>
├─ drawings: DrawingsLayer     PlaceablesLayer<DrawingData, Drawing>
├─ walls: WallsLayer           PlaceablesLayer<WallData, Wall>
└─ tokens: TokenLayer          PlaceablesLayer<TokenData, Token>

CanvasLayer → InteractionLayer → PlaceablesLayer
  objects: Map, placeables[], get(id), create(data), update(id, patch), delete(id), pick(point), pickRect(rect)

PlaceableObject → Token | Tile | Drawing | Wall
  id, document, x/y/rotation, bounds, getAABB(), draw(), refresh(), update()

CanvasViewport                 pan(), animatePan(), zoom(), fit(), centerOn(), toLocal/toScreen
CanvasAnimation + Easing       animate({ duration, ease, onUpdate })
```

## Usage

```ts
import { Canvas, newId, type SceneData } from '@openvtt/canvas';

const canvas = new Canvas(document.querySelector('#stage')!);
await canvas.initialize();

canvas.bus.tap('beforeDraw', 'log', (ctx) => { console.log('drawing scene'); return ctx; });
canvas.on('token:moved', ({ id, x, y }) => console.log(id, x, y));

await canvas.draw({
  width: 1600, height: 1000,
  grid: { type: 'square', size: 50 },
  tokens: [{ id: newId(), x: 200, y: 200, size: 1, texture: '/tokens/hero.png', label: 'Hero' }],
});

await canvas.tokens.create({ x: 500, y: 500, size: 1, texture: '/tokens/goblin.png' });
canvas.tokens.update('<id>', { x: 600, y: 600 });
```

## Roadmap (subsystems & their libraries)

These are tracked as future work, each isolated so the core stays lean:

| Subsystem | Library | Why |
| --- | --- | --- |
| Tile-based maps | `@pixi/tilemap` | thousands of tiles in a single draw call (Dungeondraft/Tiled style); not needed for single-image maps |
| Line-of-sight / fog of war | `polygon-clipping` | robust union/intersect/subtract for vision polygons + incremental fog exploration |
| Vision/fog off-main-thread | `comlink` | RPC over Web Worker; the geometry is pure and headless-runnable |
| Large map textures | KTX2/Basis | GPU-compressed textures for 8k×8k maps, declared per-platform via `@openvtt/assets` |
| Static geometry index | `flatbush` | bulk-loaded R-tree for walls/regions (rbush is used today because tokens move) |

The vision/fog worker will emit results back through `@openvtt/events` (plain JSON), never leaking Pixi objects.

## License

MIT
