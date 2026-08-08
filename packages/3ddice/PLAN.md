# PLAN — Evolução do `@openvtt/dice`

Plano de melhorias do pacote `packages/3ddice`, consolidando:
1. Correções do code review (bugs, leaks, desempenho);
2. Novas features (física em worker, pós-processamento, HDR, modelos GLTF/Draco);
3. Redesenho da API pública — rica, extensível e 100% agnóstica de framework.

Referência de arquitetura: `foundryvtt-dice-so-nice` (`PhysicsWorker`, `DiceScene`, `DiceBox`).

---

## Parte 1 — Correções do code review

### 1.1 Críticas (funcionais)

| # | Problema | Local | Correção |
|---|----------|-------|----------|
| C1 | `roll()` concorrente deixa Promise pendurada | `renderer.ts:1282` | Guardar `{resolve, reject}` do roll ativo; ao cancelar (`clearDice`/novo roll), rejeitar com `RollCancelledError`. Alternativa: fila serial de rolls (ver §3.4). |
| C2 | Troca de tema vaza texturas GPU | `factory.ts:1085` | `applyColorSet`/`setBumpMapping` devem chamar `disposeCachedMaterials()` (com refcount: não dispor texturas em uso por dados vivos). |
| C3 | Cache de materiais sem limite c/ cores aleatórias | `factory.ts:287,768` | Cache LRU (ex: 256 entradas) com `dispose()` ao evictar. A longo prazo: separar textura de face (cacheável) de cor por dado (aplicada via `material.color`). |
| C4 | Ausência de `destroy()` | `renderer.ts` | Implementar teardown completo: remover listener de resize, `#running=false` + `cancelAnimationFrame`, `renderer.dispose()` + `domElement.remove()`, dispor `scene.environment`, `DiceFactory.disposeCachedMaterials()`, limpar mapas de som. |
| C5 | `simulateThrow()` bloqueia main thread | `renderer.ts:1120` | Resolvido estruturalmente pela física em Web Worker (§2.1). Interino: chunked stepping (N steps/frame via rAF). |

### 1.2 Altas (desempenho/leaks)

| # | Problema | Local | Correção |
|---|----------|-------|----------|
| A1 | `needResize` sempre true (CSS px vs device px) | `renderer.ts:658` | Guardar `lastCssWidth/Height` e comparar com `clientWidth/Height`. |
| A2 | `setDimensions` vaza shadow maps, desk e ContactMaterials por resize | `renderer.ts:536-651` | Atualizar camera/luz/desk in-place em vez de recriar; dispor explicitamente o que for recriado; ContactMaterials criados uma única vez; paredes só têm posição atualizada. |
| A3 | Espiral de steps após tab em background | `renderer.ts:1132` | `neededSteps = Math.min(neededSteps, MAX_SUBSTEPS)` (5); usar timestamp do rAF. |
| A4 | Todos materiais `transparent=true` + `depthTest=false` | `factory.ts:724` | Materiais opacos + `polygonOffset` para as faces de texto; `transparent` só onde necessário (edge/glass). |
| A5 | 3 canvases 512² por face, sem pooling | `factory.ts:789` | Criar bump/emissive sob demanda; pool de canvases por tamanho; avaliar 256²; `createCanvas` síncrono. |
| A6 | `getFaceValue` aloca ~44 Vector3/avaliação | `factory.ts:417` | Pré-computar `faceNormals: Float32Array` na criação da geometria; scratch vectors estáticos; validar via `face.start`. |
| A7 | Bug `RANDOM_Z_MIN/MAX` trocados (z∈[400,600]) | `renderer.ts:709` | `Math.random() * (MAX - MIN) + MIN`. |
| A8 | Chave de cache sem font/fontOffset/material | `factory.ts:768` | Incluir `font`, `fontOffsetY`, `material`, hash de `materialOptions` na `cachestring`. |

### 1.3 Médias

- **M1** Remover render redundante do `setTimeout(100)` em `clearDice`; centralizar renders num único loop com dirty flag. (`renderer.ts:1290`)
- **M2** Sincronizar física iterando `diceList` em vez de `for...in scene.children`. (`renderer.ts:1140`)
- **M3** Marcar geometrias/materiais clonados (`userData.owned`) em `swapDiceFace` e dispô-los em `clearDice`/`remove`. (`renderer.ts:817,897`)
- **M4** `updateConfig` só alterar `theme_customColorset` se a chave estiver presente (`'theme_customColorset' in options`). (`renderer.ts:472`)
- **M5** `toggleShadows` deve setar `material.needsUpdate` em toda a cena. (`renderer.ts:215`)
- **M6** Implementar injeção pública de `DiceFunctions` (rethrow/exploding) ou remover código morto. (`renderer.ts:1059`)
- **M7** Corrigir/remover loop morto de `animateAfterThrow`. (`renderer.ts:1247`)
- **M8** `Promise.all` nos spawns; `bind` de `eventCollide` memoizado. (`renderer.ts:910`)
- **M9** `loadSounds` com `Promise.all` + timeout; `sounds_dice` como `Map`; unload no `destroy()`. (`renderer.ts:388`)
- **M10** `getDiceResults` robusto a `diceList` esparsa (`?.result?.at(-1)`). (`renderer.ts:1332`)
- **M11** Guard para corner-face vazia em `createChamferedGeometry`. (`factory.ts:1477`)

### 1.4 Baixas / limpeza

- `for...in` em arrays → `for...of` (`renderer.ts:689,1140`).
- Remover blocos comentados.
- Substituir `Object.assign(this, ...)` por destructuring tipado (`renderer.ts:191,471`).
- Separar `#running: any` em `running: boolean` + `threadId: number`.
- `debounce` com `cancel()`/`flush()` (`utils.ts`) — necessário para o `destroy()`.
- Renomear config `framerate` → `timestep` (com alias deprecated).
- Tratar `textCache` para arrays de strings (`factory.ts:762`).
- Remover `#scaleGeometry()` vazio e `scale` morto, ou implementar.
- Cachear/dispor `new THREE.Texture(diceobj.normals[i])` (`factory.ts:713`).

---

## Parte 2 — Novas features

### 2.1 Física em Web Worker ⭐ (estrutural)

Mover o mundo cannon-es para um worker dedicado, seguindo o padrão `PhysicsWorker` do dice-so-nice.

- **Arquitetura:**
  - `src/workers/physics.worker.ts`: World, bodies, constraints, `simulateThrow`, `getDiceValue` (detecção de face no worker), stepping.
  - Protocolo de mensagens tipado (`src/workers/protocol.ts`): operações `init`, `createDiceBatch`, `simulateThrow`, `step`, `removeDice`, `updateBarriers`, `applyImpulse`, `getResults`.
  - Main thread mantém apenas meshes three.js; por frame, recebe transforms (Float32Array flat `[id, px,py,pz, qx,qy,qz,qw]*` via transferable `ArrayBuffer`) e aplica nos meshes — zero alocação por frame.
  - Bundling: worker inline via `new Worker(new URL('./physics.worker.ts', import.meta.url))` (Vite/tsup compatível) com opção `workerFactory` custom na config para apps que precisem de CSP estrita.
  - Fallback síncrono automático se `Worker` indisponível (SSR/testes).
- **Benefícios colaterais:** C5 resolvido; `simulateThrow` deixa de bloquear; stepping desacoplado do rAF.
- **Som:** eventos de colisão agregados no worker e enviados em batch (`[{type, speed}]`) para o `SoundManager` na main thread.

### 2.2 Pós-processamento (EffectComposer)

Pipeline opcional, composto por config (padrão do three/addons):

```
RenderPass → OutlinePass (seleção) → UnrealBloomPass → SMAAPass → OutputPass
```

- `postprocessing: { enabled, bloom: { strength, radius, threshold }, outline: { edgeStrength, pulsePeriod, visibleEdgeColor, hiddenEdgeColor } }`.
- Composer recriado só quando config muda; `setSize` propagado no resize; dispose completo no `destroy()`.
- ACES tone mapping mantido via `OutputPass`.

### 2.3 Antialiasing configurável

- `antialias: 'none' | 'msaa' | 'smaa'` (default `'smaa'`).
- `msaa` → `antialias: true` no WebGLRenderer + composer com `WebGLRenderTarget` multisampled (`samples: 4`); `smaa` → renderer sem AA + `SMAAPass`; `none` → ambos desligados (útil p/ dispositivos fracos).

### 2.4 HDR environments reais

- 3 HDRIs bundled (ou servidos via `assetPath`): `neutral`, `tavern`, `neon` (equirect `.hdr`/~1k, HalfFloat).
- Carregamento via `HDRLoader` + `PMREMGenerator` (padrão dice-so-nice: `fromEquirectangular`, dispor texture+generator após).
- `environment: 'neutral' | 'tavern' | 'neon' | 'none' | { source: string }` — custom via URL.
- `environmentIntensity` exposto (three r163+: `scene.environmentIntensity`).
- O canvas-gradient procedural atual vira fallback quando `environment: 'none'`/falha de load.

### 2.5 Respeitar `cubeMap` do tema ⭐

Hoje `DiceTheme.cubeMap` é declarado e ignorado.

- Se o tema define `cubeMap` (6 imagens), carregar via `CubeTextureLoader` (path resolvido contra `assetPath`) e usar como `scene.environment` **com precedência sobre o HDR global**; tema sem `cubeMap` herda o environment global.
- Ordem de precedência: `theme.cubeMap` > `config.environment` > fallback procedural.
- Cache de CubeTextures por URL + dispose na troca/destroy.
- Longo prazo: aceitar `cubeMap` também como HDRI por tema (`theme.environment`), unificando os dois mecanismos — cubemap legado (LDR) e HDRI (recomendado).

### 2.6 Normal maps via Sobel

- `normalMaps: boolean` + gerador `createNormalMapFromHeight(canvas, strength)` aplicando operador Sobel sobre o height (bump canvas já gerado por face).
- Substitui o fluxo atual de `bumpMap` por `normalMap` (melhor qualidade, sem custo extra de textura: reutiliza o canvas bump como entrada).
- Aplicado também às texture bump de `TEXTURELIST` (`source_bump` → normal map em load-time, cacheado).

### 2.7 OutlinePass (seleção)

- API de seleção agnóstica: `select(dieIds: number[])`, `clearSelection()`, `onDieClick` (raycast no pointerdown/click do canvas).
- `OutlinePass.selectedObjects` recebe os meshes; config de cor/pulso via `postprocessing.outline`.
- Base para interações futuras (reroll ao clicar, remover dado, hover highlight).

### 2.8 Qualidade de sombra configurável

- `shadows: 'none' | 'low' | 'medium' | 'high'` (mantém boolean como alias: `true`→`'medium'`, `false`→`'none'`).
- Map sizes: low=1024, medium=2048, high=4096; `none` desliga `shadowMap.enabled` + `castShadow`/`receiveShadow` com `needsUpdate` global (resolve M5).
- Trocar em runtime via `updateConfig` (sem recriar renderer: dispor shadow map antigo, setar novo tamanho, `light.shadow.map = null` para forçar realloc).

### 2.9 Modelos GLTF/Draco reais

- Hoje `loadModel` existe mas é decorativo (física sempre procedural).
- Suporte real:
  - `registerDiceModel({ type, url, scale?, physicsShape?: 'auto' | 'convex' | PhysicsShapeDescriptor })`.
  - `DRACOLoader` configurável (`dracoPath`, default CDN ou `assetPath/draco/`); meshopt opcional.
  - Física: `physicsShape: 'auto'` gera `ConvexPolyhedron` a partir dos vértices do modelo (decimado, ex: ≤ 32 vértices via convex hull simplificado); descritor manual para shapes custom (esfera/caixa/composto).
  - Mapeamento de faces → valores: o modelo declara `faceValues` (ordem dos grupos/materiais) ou cai no labels procedurais aplicados sobre UVs do modelo.
  - Modelos são cacheados por URL; clone por instância; dispose no destroy.

---

## Parte 3 — API pública redesign

Objetivo: API rica, extensível, idiomática (padrão libs modernas de canvas/WebGL), zero acoplamento a framework.

### 3.1 Construção e lifecycle

```ts
const dice = createDiceBox(container, options);   // factory function (retorna DiceBox)
await dice.initialize();
dice.destroy();                                    // teardown completo (C4)
```

- `createDiceBox(element: HTMLElement, options?: DiceBoxOptions): DiceBox`
- `DiceBoxOptions` tipada, flat, com defaults documentados; `updateConfig(partial)` valida chaves e aplica incrementalmente (sem `Object.assign(this)`).
- Lifecycle explícito: `initialize()`, `destroy()`, `initialized`, `disposed`.

### 3.2 Rolling

```ts
await dice.roll('2d20+1d6');                    // RollResult
await dice.roll(['2d20', '1d6[boon]']);         // múltiplas notações
await dice.add('1d6');                          // adiciona à mesa
await dice.reroll([0, 2]);                      // rerola por id
await dice.remove([1]);
await dice.clear();
dice.cancel();                                  // cancela roll em andamento (rejeita Promise) — resolve C1
```

- Rolls concorrentes: por padrão **fila serial** (`queueMode: 'serial' | 'replace' | 'parallel'`); `'replace'` = comportamento atual (cancela o anterior, mas rejeitando a Promise corretamente).
- `roll()` nunca deixa Promise pendurada: sempre resolve, rejeita (`RollCancelledError`) ou tem timeout configurável.

### 3.3 Eventos (emitter tipado, framework-agnostic)

```ts
dice.on('roll:start', (notation) => {});
dice.on('roll:finish', (result: RollResult) => {});
dice.on('roll:cancel', () => {});
dice.on('die:click', (dieId, result) => {});
dice.on('theme:change', (themeId) => {});
dice.on('ready', () => {});
dice.on('error', (err) => {});
const off = dice.on('roll:finish', fn); off(); // ou dice.off(...)
```

- Emitter interno mínimo (`on/off/once/emit`), sem dependência.

### 3.4 Temas e extensibilidade

```ts
import { THEMES, registerTheme, registerTexture, registerMaterial, registerDiceModel } from '@openvtt/dice';

registerTheme('neon-dice', { name: 'Neon Dice', surface: 'metal', dice: {...}, cubeMap: [...] });
registerTexture('holo', { source: 'textures/holo.webp', material: 'iridescent' });
registerMaterial('obsidian', { type: 'physical', roughness: 0.05, ... });
registerDiceModel({ type: 'd20', url: 'models/d20-draco.glb', physicsShape: 'auto' });
```

- Registries públicos substituem os Records fechados (`THEMES`/`TEXTURELIST`/`MATERIALTYPES` viram defaults de registries abertos, mantendo compat).
- Hooks/plugins: `dice.use(plugin)` com `plugin({ box, factory, colors })` — ponto único de extensão (ex: plugin de sons, plugin de regras de reroll/exploding dice — resolve M6 via API pública `DiceFunctions`).

### 3.5 Config consolidada (proposta)

```ts
interface DiceBoxOptions {
  assetPath?: string;                 // default './'
  worker?: boolean;                   // física em worker, default true
  antialias?: 'none' | 'msaa' | 'smaa';
  shadows?: 'none' | 'low' | 'medium' | 'high';
  environment?: 'neutral' | 'tavern' | 'neon' | 'none' | { source: string };
  environmentIntensity?: number;
  postprocessing?: {
    enabled?: boolean;
    bloom?: false | { strength?: number; radius?: number; threshold?: number };
    outline?: false | { edgeStrength?: number; pulsePeriod?: number; visibleEdgeColor?: string; hiddenEdgeColor?: string };
  };
  normalMaps?: boolean;
  theme?: string;                     // colorset id
  surface?: string;
  customColorset?: ColorSetInput | null;
  sounds?: boolean;
  volume?: number;
  strength?: number;
  gravityMultiplier?: number;
  lightIntensity?: number;
  baseScale?: number;
  timestep?: number;                  // ex-'framerate' (alias deprecated)
  iterationLimit?: number;
  maxPixelRatio?: number;             // default 2
  queueMode?: 'serial' | 'replace' | 'parallel';
  workerFactory?: () => Worker;       // override p/ CSP/bundlers
  dracoPath?: string;
}
```

### 3.6 Qualidade de API (checklist)

- Tudo que aloca tem dispose/destroy correspondente; documentado.
- Toda operação async rejeita com erros tipados (`DiceError`, `RollCancelledError`, `AssetLoadError`).
- Sem globals: nada de `window.*` fora do necessário, listeners sempre removidos.
- SSR-safe: importar o pacote não toca em DOM (só na construção).
- Tipos públicos exportados: `DiceBoxOptions`, `RollResult`, `DieResult`, `DiceTheme`, `ColorSetInput`, eventos.
- ESM-first + CJS, `sideEffects: false` para tree-shaking.
- Sem breaking silencioso: aliases deprecated com `console.warn` uma vez.

---

## Parte 4 — Fases de execução

### Fase 1 — Estabilização (review crítico/alto)
1. `destroy()` completo + debounce cancelável (C4, B10).
2. Promises de roll sempre resolvem/rejeitam + `cancel()` (C1).
3. dispose de texturas na troca de tema + cache LRU (C2, C3).
4. Resize: comparação correta + sem leaks de shadow/desk/contact (A1, A2).
5. Clamp de substeps (A3), bug RANDOM_Z (A7), chave de cache (A8).
6. Materiais opacos + polygonOffset (A4), canvases sob demanda (A5), `getFaceValue` sem alocação (A6).
7. Médias M1–M11 e limpezas B*.

**Critério de aceite:** 100 trocas de tema + 100 rolls consecutivos sem crescimento de VRAM; mount/unmount 20× sem contextos WebGL órfãos; `await roll()` nunca trava.

### Fase 2 — Física em Web Worker
1. Protocolo tipado + worker cannon-es com batch de transforms transferables.
2. Detecção de face/resultados no worker.
3. Fallback síncrono + `workerFactory`.
4. Sons via eventos de colisão em batch.

**Critério de aceite:** roll de 10d20 sem frames > 16ms na main thread; resultados idênticos ao modo síncrono (mesma seed).

### Fase 3 — Render e iluminação
1. EffectComposer + bloom + outline + SMAA + AA configurável (2.2, 2.3, 2.7).
2. HDR environments (neutral/tavern/neon) + precedência de `cubeMap` do tema (2.4, 2.5).
3. Shadow quality presets (2.8).
4. Normal maps via Sobel (2.6).

**Critério de aceite:** alternar AA/sombras/environment em runtime sem reinicializar; tema com `cubeMap` renderiza reflexos do cubemap.

### Fase 4 — GLTF/Draco e API pública
1. Registries abertos (themes/textures/materials/models) + `registerDiceModel` com física real (2.9).
2. Event emitter tipado + queue de rolls + erros tipados (3.2, 3.3).
3. `dice.use(plugin)` + DiceFunctions público.
4. Documentação da API (README + TSDoc) + exemplos vanilla/React/Vue/Svelte.

**Critério de aceite:** consumir a lib em app vanilla sem qualquer import de framework; modelo Draco rola com física correta e resultado correto por face.

---

## Notas

- Features novas devem ser opt-in e degradar graciosamente (sem worker → síncrono; sem HDR → procedural; sem composer → render direto).
- Manter compatibilidade de comportamento visual com o schwalb-vault durante a Fase 1 (é o consumidor de referência).
- Assets novos (HDRIs, Draco decoder) ficam fora do bundle: servidos via `assetPath`, com documentação de cópia (`public/`).
