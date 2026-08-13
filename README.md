# openvtt

**Open building blocks for virtual tabletop software.** A monorepo of composable TypeScript packages that cover the full stack of a VTT — from dice math to a character-sheet engine to a production-grade 3D dice roller — with schema-validated contracts, deterministic evaluation, and zero lock-in.

```bash
bun install
bun run dev        # playground at apps/playground
```

## Why openvtt

- **One canonical dice IR.** Parse Foundry, Roll20, or the canonical OpenVTT notation into a single intermediate representation, evaluate it deterministically with a seeded RNG, and serialize back to any dialect. [Learn more](docs/guides/dice-rolling.md)
- **An effect-oriented character-sheet engine.** The document stays minimal (`base` + `effects`); everything else — derived stats, stacking, durations, triggers, roll transforms — is produced by a pure, auditable pipeline that answers "why is AC 14?". [Learn more](docs/guides/character-sheets.md)
- **A real 3D dice box.** three.js rendering, cannon-es physics in a Web Worker, themes/textures/materials registries, collision sounds, post-processing, and an event-driven API — framework-agnostic. [Learn more](docs/guides/3d-dice.md)
- **Typed events everywhere.** Every package communicates through `@openvtt/events`: Valibot-validated payloads, 8 hook strategies, browser-extension bridge, and cross-tab broadcast. [Learn more](docs/guides/events-and-hooks.md)
- **No `eval`, no surprises.** Formulas compile to a JSON-logic-shaped AST; validation is Valibot end-to-end; every public ID is a sortable UUID v7.

## Packages

| Package | What it does | Docs |
|---|---|---|
| `@openvtt/events` | Schema-validated event bus with typed events, tapable-style hooks, bridge & broadcast | [API](docs/api/events.md) · [Guide](docs/guides/events-and-hooks.md) |
| `@openvtt/formula` | Expression language → JSON-logic AST: parse, evaluate, JIT-compile, memoize | [API](docs/api/formula.md) · [Guide](docs/guides/formulas.md) |
| `@openvtt/dice-core` | Dice IR (die terms, pools, 21 modifiers) + deterministic seeded evaluator | [API](docs/api/dice-core.md) · [Guide](docs/guides/dice-rolling.md) |
| `@openvtt/dice-notation` | Canonical, unambiguous dice notation parser/serializer | [API](docs/api/dice-notation.md) · [Guide](docs/guides/dice-rolling.md) |
| `@openvtt/dice-foundry-notation` | Foundry VTT notation dialect | [API](docs/api/dice-foundry-notation.md) · [Guide](docs/guides/notation-dialects.md) |
| `@openvtt/dice-roll20-notation` | Roll20 notation dialect | [API](docs/api/dice-roll20-notation.md) · [Guide](docs/guides/notation-dialects.md) |
| `@openvtt/sheet` | Character-sheet engine: system packs, effects, derived values, triggers, roll templates | [API](docs/api/sheet.md) · [Guide](docs/guides/character-sheets.md) |
| `@openvtt/dice` | Framework-agnostic 3D dice roller (`DiceBox`) with worker physics | [API](docs/api/dice.md) · [Guide](docs/guides/3d-dice.md) |
| `@openvtt/physics` | cannon-es physics host: Web Worker execution with main-thread fallback | [API](docs/api/physics.md) · [Guide](docs/guides/assets-and-rendering.md) |
| `@openvtt/render3d` | three.js toolkit: post-processing, HDR/cubemap environments, normal maps | [API](docs/api/render3d.md) · [Guide](docs/guides/assets-and-rendering.md) |
| `@openvtt/assets` | Declarative asset packs with content-addressed caching and preload progress | [API](docs/api/assets.md) · [Guide](docs/guides/assets-and-rendering.md) |

## Quick taste

Deterministic dice rolls, from notation to result:

```ts
import { fromFormula } from '@openvtt/dice-notation';
import { evaluateRoll } from '@openvtt/dice-core';

const expr = fromFormula('1d20 + @abilities.str.mod');
const roll = evaluateRoll(expr, {
  seed: 'demo',
  scope: { abilities: { str: { mod: 3 } } },
});

console.log(roll.value);   // reproducible for seed 'demo'
```

3D dice in the browser:

```ts
import { DiceBox } from '@openvtt/dice';

const box = new DiceBox(document.querySelector('#dice'), { assetPath: '/' });
box.on('ready', async () => {
  const result = await box.roll('2d20+1d6');
  console.log(result.total);
});
await box.initialize();
```

## Documentation

Full guides and API references live in [`docs/`](docs/README.md):

- [Getting started](docs/guides/getting-started.md) — install, commands, first roll in five minutes
- [Events and hooks](docs/guides/events-and-hooks.md) — contracts, validation, hook strategies, bridge, broadcast
- [Formulas](docs/guides/formulas.md) — expression language, AST, evaluation, JIT
- [Dice rolling](docs/guides/dice-rolling.md) — the IR, all 21 modifiers, worked examples
- [Notation dialects](docs/guides/notation-dialects.md) — canonical vs Foundry vs Roll20, and the traps between them
- [Character sheets](docs/guides/character-sheets.md) — system packs, the compute pipeline, effects and triggers
- [3D dice](docs/guides/3d-dice.md) — `DiceBox` options, rolling API, themes, models, sounds
- [Assets and rendering](docs/guides/assets-and-rendering.md) — the lower-level building blocks

## Development

Bun workspaces + Turborepo. All commands run from the repo root and fan out to every workspace:

| Task | Command |
|---|---|
| Install | `bun install` |
| Build | `bun run build` |
| Dev (watch) | `bun run dev` |
| Test | `bun run test` |
| Lint | `bun run lint` |
| Typecheck | `bun run typecheck` |

Scope to a single package with `--filter`, e.g. `bun run test --filter=@openvtt/events`.

Try everything live in the [playground](apps/playground): `bun run dev --filter=playground`.

### Conventions

- **UUID v7** for every generated ID (`uuid` package).
- **Valibot** for all schema validation — no zod, no ad-hoc guards.
- **`@openvtt/events`** for all pub/sub and hooks — no custom emitters.
- Pure ESM, strict TypeScript, packages built with tsup, apps with Vite.

## License

[MIT](LICENSE)
