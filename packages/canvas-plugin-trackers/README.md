# @openvtt/canvas-plugin-trackers

Trackers de token extensíveis para o `@openvtt/canvas` — inspirado no [Owl Trackers](https://extensions.owlbear.rodeo/owl-trackers) (edição rápida com matemática inline, defaults de cena) e no [Bar Brawl](https://gitlab.com/woodentavern/foundryvtt-bar-brawl) (barras value/max, cores interpoladas, visibilidade por audiência, posicionamento).

## Uso

```ts
import { Canvas } from '@openvtt/canvas';
import { trackersPlugin } from '@openvtt/canvas-plugin-trackers';

const canvas = new Canvas(container, {
  plugins: [/* ..., tokensPlugin, */ trackersPlugin],
});
```

O plugin registra a contribuição de context menu (edição rápida por token, editor por tracker, defaults de cena, presets), renderiza barras e chips sobre os tokens e publica o contrato `trackers:*` no bus do canvas.

### API principal

```ts
const trackers = canvas.plugins.get<TrackersPlugin>('trackers')!;

trackers.upsert(tokenId, { name: 'HP', kind: 'bar', value: 12, max: 12, label: 'fraction' });
trackers.applyMathInput(tokenId, trackerId, '-7');   // '+7' adiciona, '-7' subtrai, '=-7' define, '7' define
trackers.setValue(tokenId, trackerId, 20);
trackers.setDefaults([{ name: 'AC', kind: 'counter', value: 15 }]);
trackers.applyDefaultsTo([tokenIdA, tokenIdB]);
trackers.registerPreset(defineTrackerPreset({ id: 'my-system', name: 'My System', trackers: [...] }));
trackers.serialize(); trackers.hydrate(snapshot);
trackers.prune(liveTokenIds);
```

### Tracker

| Campo       | Default     | Descrição                                                       |
| ----------- | ----------- | --------------------------------------------------------------- |
| `name`      | —           | obrigatório; usado para mesclar defaults                        |
| `kind`      | `'counter'` | `counter` (chip) ou `bar` (value/max)                           |
| `value/max/min` | `0/–/0` | faixa do tracker; `max` obrigatório na prática para `bar`       |
| `math`      | `true`      | aceita `+n`/`-n` na edição; `false` só permite definição direta |
| `clamp`     | `true`      | limita `value` a `[min, max]`; `false` permite valores extremos |
| `color`     | por kind    | `'#hex'` único ou `{ min, max }` interpolado em HSV             |
| `side/inset`| `bottom/inner` | `top/bottom/left/right` × `inner/outer`                       |
| `opacity`   | `0.85`      | 0–1                                                             |
| `invert`    | `false`     | barra invertida (recursos "negativos", ex.: ferimentos)         |
| `segments`  | `0`         | aproximação em N pips (rótulo acompanha, ex.: `3/3`)            |
| `label`     | `'value'`   | `none/value/max/fraction/percent` (+ `prefix`, `units`)         |
| `hideEmpty/hideFull` | `false` | oculta quando vazio/cheio                              |
| `audience`  | gm/owner `always`, others `hover` | visibilidade por papel: `always/hover/selected/never` |
| `source`    | `'inline'`  | id de um resolver registrado (ex.: sheet, fórmula)              |

### Extensibilidade

**Hooks do bus** (waterfall — retornar `undefined` preserva o valor):

```ts
tapTrackersHooks(canvas.bus, 'my-plugin', {
  resolve: (p) => (p.tracker.name === 'HP' ? { ...p, value: 20 } : undefined),
  label: (p) => ({ ...p, label: `❤ ${p.label}` }),
  visibility: (p) => (p.tracker.name === 'AC' ? { ...p, visible: false } : undefined),
});

onTrackersEvents(canvas.bus, {
  value: ({ tokenId, name, before, after }) => console.log(tokenId, name, before, '→', after),
});
```

**Resolvers de valor** (fontes externas; falhas caem para o valor inline):

```ts
trackers.registerResolver('sheet', ({ tracker }) => sheet.get(tracker.name));
trackers.upsert(tokenId, { name: 'HP', source: 'sheet', kind: 'bar', max: 20 });
```

Exemplo com `@openvtt/sheet` — o tracker resolve direto da ficha computada do personagem (retornar `null` preserva o valor inline):

```ts
import { getPath } from '@openvtt/sheet';

const engines = new Map<string, SheetEngine>(); // tokenId → engine da ficha

trackers.registerResolver('sheet', ({ tokenId, tracker }) => {
  const sheet = engines.get(tokenId)?.compute();
  if (!sheet) return null;
  const hp = getPath(sheet.values, `attributes.${tracker.name.toLowerCase()}`);
  return typeof hp === 'number' ? hp : null;
});
```

**Viewer** (papel/posse para visibilidade por audiência):

```ts
new TrackersPlugin({ viewer: () => ({ role: 'gm', owns: (id) => ownedIds.has(id) }) });
```

### Persistência

O estado vive no plugin (não no documento do token), sobrevive a uninstall e é serializável:

```ts
localStorage.setItem('trackers', JSON.stringify(trackers.serialize()));
trackers.hydrate(localStorage.getItem('trackers') ? JSON.parse(...) : { version: 1, defaults: [], tokens: {} });
```

Estado de tokens deletados é retido (undo de delete recria o documento sem perda). No save da cena, evicte os ids mortos:

```ts
trackers.prune(canvas.documents.layer('token')!.placeables.map((t) => t.id));
```

## Desenvolvimento

`bun run build` · `bun run test` · `bun run typecheck` (a partir da raiz do monorepo, com `--filter=@openvtt/canvas-plugin-trackers`).
