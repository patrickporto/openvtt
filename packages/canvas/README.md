# @openvtt/canvas

Framework-agnostic, PixiJS-powered game canvas for OpenVTT — **plugin-first**. O core fornece apenas infraestrutura (stage, viewport, input, state machine de tools, layers, histórico, seleção, bus de eventos/hooks). **Todo tipo de documento e toda capacidade do canvas é contribuída por plugins.**

## Arquitetura

```
@openvtt/canvas (core)                    infra: stage/viewport/input/tools/layers/history/selection
└─ canvas.use(plugin)                     PluginManager (deps, lifecycle, APIs)
   ├─ DocumentRegistry                    registerDocumentType() → layer + eventos + histórico
   ├─ Bus de capacidades (hooks)          movement/sight/vision/light/select/handles/scene
   └─ @openvtt/events                     eventos dinâmicos registerEvent() por plugin

Plugins (pacotes independentes):
  @openvtt/canvas-plugin-tiles      tiles (fundo)
  @openvtt/canvas-plugin-drawings   drawings (rect/ellipse/brush/text)
  @openvtt/canvas-plugin-walls      walls, portas, curvas, blockers de movimento/visão
  @openvtt/canvas-plugin-templates  templates de área (circle/cone/ray)
  @openvtt/canvas-plugin-tokens     tokens, fontes de visão e luz
  @openvtt/canvas-plugin-lights     luzes ambiente
  @openvtt/canvas-plugin-measure    régua de medição
  @openvtt/canvas-plugin-lighting   overlay de iluminação
  @openvtt/canvas-plugin-fog        fog of war + painel de UI

@openvtt/canvas-preset-standard          1 import com todos os plugins acima
```

## Boundary arquitetural

Pixi é dono da scene tree; **nenhum objeto Pixi sai do canvas**. Tudo que cruza a fronteira passa pelo `@openvtt/events` como JSON puro, validado por Valibot — consumível por qualquer host (vanilla, React, worker, headless) e compatível com `@openvtt/formula`.

## Quick start

```ts
import { createStandardCanvas } from '@openvtt/canvas-preset-standard';
import { defineCanvasElements } from '@openvtt/canvas';

defineCanvasElements();
const canvas = createStandardCanvas(container);
await canvas.initialize();
await canvas.draw({
  width: 1600, height: 1000,
  grid: { type: 'square', size: 50 },
  documents: {
    token: [{ x: 200, y: 200, label: 'Hero', visionRadius: 6 }],
    wall: [{ segments: [{ x1: 0, y1: 300, x2: 600, y2: 300, door: true }] }],
    light: [{ x: 400, y: 150, dim: 9, bright: 3, color: '#ffb35c' }],
  },
});
```

Cena aceita chaves legadas (`tokens: [...]`, `walls: [...]`) ou o mapa `documents: { [type]: [...] }` — cada plugin declara seu `sceneKey`.

## Composição seletiva

```ts
import { Canvas } from '@openvtt/canvas';
import { tokensPlugin } from '@openvtt/canvas-plugin-tokens';
import { wallsPlugin } from '@openvtt/canvas-plugin-walls';

const canvas = new Canvas(container);
await canvas.use(wallsPlugin);
await canvas.use(tokensPlugin);
await canvas.initialize();
```

## Criando um tipo de documento novo (plugin customizado)

Qualquer documento é um plugin: schema Valibot + placeable + (opcional) tool/transform/behavior.

```ts
import * as v from 'valibot';
import { definePlugin, PlaceableObject, Tool } from '@openvtt/canvas';

const NoteSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  x: v.number(),
  y: v.number(),
  text: v.string(),
});

class Note extends PlaceableObject<{ x: number; y: number; text: string }> {
  readonly objectType = 'note';
  get bounds() { return { x: -8, y: -8, width: 16, height: 16 }; }
  refresh(): void { /* desenha o pin */ }
}

export const notesPlugin = definePlugin({
  id: 'notes',
  install(ctx) {
    ctx.registerDocumentType({
      type: 'note',
      schema: NoteSchema,
      placeable: Note,
      layer: { label: 'Notes', order: 600 },
      sceneKey: 'notes',
    });
  },
});
```

Com isso você ganha de graça: layer com spatial index (pick/pickRect), eventos `note:create|update|delete` (registrados e validados no bus), histórico/undo, seleção/handles, marquee, eraser, e leitura da cena via `scene.notes` ou `documents.note`. Opcionalmente: `ctx.registerTool({ tool, hotkey })`, `transform` (resize/rotate), `behavior` (snapToGrid/collides/rulerOnDrag), taps nos hooks abaixo.

## Hooks de capacidades (plugins conversam pelo bus, não entre si)

| Hook | Estratégia | Contrato |
| --- | --- | --- |
| `beforeDraw` | syncWaterfall | `{ scene }` — transforma/valida a cena |
| `scene:setup` / `scene:teardown` / `scene:refresh` | sync | ciclo de vida e recomposição de overlays |
| `movement:segments` | syncWaterfall | taps anexam `{a,b}` bloqueadores; core testa colisão |
| `sight:segments` | syncWaterfall | taps anexam segmentos que bloqueiam visão |
| `vision:sources` | syncWaterfall | taps anexam `{x,y,radius}` (ex.: tokens) |
| `light:sources` | syncWaterfall | taps anexam `{x,y,dim,bright,color?}` |
| `select:pointerdown` / `select:hovercursor` / `select:doubleclick` | syncBail | interceptação da Select tool (ex.: portas) |
| `handles:collect` | syncWaterfall | handles custom da seleção (ex.: pontos de wall) |
| `handle:drag` | syncBail | gesto de drag de handle custom (start/move/end) |

Fog/lighting **não conhecem** tokens/walls: consomem `vision:sources`/`light:sources`/`sight:segments`. Walls contribui blockers. Tokens contribui fontes. Composição sem acoplamento.

## Eventos

Core: `ready`, `destroy`, `pan`, `zoom`, `pointerdown/move/up`, `ping`, `tool:changed`, `history:change`, `layers:change`, `selection:change`, `plugin:registered`, `document:type|create|update|delete|moved`.

Plugins registram os seus dinamicamente (`token:moved`, `measure`, `fog:change`, `lighting:change`, ...) com schema Valibot via `ctx.bus.registerEvent`.

## API central

```
Canvas
├─ use(plugin) / plugins.get(id) / plugins.list()
├─ documents: DocumentRegistry
|    create(type, data) · update(type, id, changes) · delete(type, id)
|    get(type, id) · layer(type) · types() · createFromScene(scene)
├─ layers: LayerManager            visible/opacity/locked/order, reordenação
├─ tools: ToolManager              options por tool (defaults dos plugins)
├─ hotkeys: HotkeyManager          @openvtt/hotkeys — tool:*, undo, redo, ping, pan (rebindáveis)
├─ bus: CanvasBus                  eventos + hooks (@openvtt/events)
├─ select/clearSelection/selected  seleção genérica sobre o registry
├─ isMoveBlocked(from, to)         colisão via hook movement:segments
├─ grid: GridLayer                 square/hex-v/hex-h/isometric, snap
├─ viewport: CanvasViewport        pan/zoom/fit/centerOn/toLocal/toScreen
└─ history: HistoryManager         undo/redo em batch, ligado ao registry

PlaceablesLayer (genérica)         create com validação de schema, RBush pick/pickRect,
|                                  eventos <type>:* + document:*, onMutate → histórico
PlaceableObject                    id, document, x/y/rotation, bounds, getAABB, refresh
```

## Libs adotadas

| Concern | Library |
| --- | --- |
| IDs | `uuid` v7 (`newId`) |
| Schemas | `valibot` (core + plugins) |
| Eventos/hooks | `@openvtt/events` (`createBus`, `registerEvent`/`registerHook`) |
| Câmera | `pixi-viewport` 6 |
| Spatial index | `rbush` 4 |
| Selection FX | `pixi-filters` 6 (`GlowFilter`) |
