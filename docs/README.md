# openvtt Documentation

openvtt is a Bun + Turborepo monorepo of TypeScript packages for building virtual tabletop (VTT) tooling: a schema-validated event bus, a formula engine, a dice intermediate representation (IR) with deterministic evaluation, dice notation parsers, a character sheet engine, and a complete 3D dice rolling stack (physics, rendering, assets).

All packages are pure ESM, built with tsup, and tested with `bun test`. Shared conventions across the monorepo:

- **IDs** are UUID v7 (time-ordered, sortable), generated via the `uuid` package.
- **Schema validation** uses [Valibot](https://valibot.dev) everywhere.
- **Pub/sub and hooks** always go through `@openvtt/events`.

## Packages at a glance

| Package | Description | API reference | Guide |
|---|---|---|---|
| `@openvtt/events` | Schema-validated event bus with typed events, tapable-style hooks, browser bridge, and cross-tab broadcast | [api/events.md](api/events.md) | [Events and hooks](guides/events-and-hooks.md) |
| `@openvtt/formula` | Expression language and JSON-logic-shaped AST for derived values, conditions, and roll math | [api/formula.md](api/formula.md) | [Formulas](guides/formulas.md) |
| `@openvtt/dice-core` | Dice IR (die terms, pools, 21 modifiers) plus a deterministic evaluator | [api/dice-core.md](api/dice-core.md) | [Dice rolling](guides/dice-rolling.md) |
| `@openvtt/dice-notation` | Canonical dice notation parser/serializer (unambiguous modifier names) | [api/dice-notation.md](api/dice-notation.md) | [Dice rolling](guides/dice-rolling.md) |
| `@openvtt/dice-foundry-notation` | Foundry VTT notation dialect (`x`, `kh`, `r`, `rr`, `4df`, ...) | [api/dice-foundry-notation.md](api/dice-foundry-notation.md) | [Notation dialects](guides/notation-dialects.md) |
| `@openvtt/dice-roll20-notation` | Roll20 notation dialect (`!`, `!p`, `ro`, `@{attr}`, implicit successes) | [api/dice-roll20-notation.md](api/dice-roll20-notation.md) | [Notation dialects](guides/notation-dialects.md) |
| `@openvtt/sheet` | Character sheet engine: documents, effects, derived values, triggers, roll templates | [api/sheet.md](api/sheet.md) | [Character sheets](guides/character-sheets.md) |
| `@openvtt/dice` | Framework-agnostic 3D dice roller (`DiceBox`) with three.js rendering and worker physics | [api/dice.md](api/dice.md) | [3D dice](guides/3d-dice.md) |
| `@openvtt/physics` | cannon-es physics host with Web Worker execution and main-thread fallback | [api/physics.md](api/physics.md) | [Assets and rendering](guides/assets-and-rendering.md) |
| `@openvtt/render3d` | three.js toolkit: post-processing, HDR/cubemap environments, normal-map utilities | [api/render3d.md](api/render3d.md) | [Assets and rendering](guides/assets-and-rendering.md) |
| `@openvtt/assets` | Asset manifest, manager, caching adapters, and preload pipeline | [api/assets.md](api/assets.md) | [Assets and rendering](guides/assets-and-rendering.md) |

## Guides

| Guide | Description |
|---|---|
| [Getting started](guides/getting-started.md) | Install, repo layout, commands, and your first roll in under five minutes |
| [Events and hooks](guides/events-and-hooks.md) | Contracts, validation, the 8 hook strategies, middleware, bridge, and broadcast |
| [Formulas](guides/formulas.md) | The `@openvtt/formula` expression language, AST, evaluation, JIT, and memoization |
| [Dice rolling](guides/dice-rolling.md) | The dice IR, all 21 modifiers, deterministic rolls, and worked examples |
| [Notation dialects](guides/notation-dialects.md) | Canonical vs Foundry vs Roll20 syntax and how to convert between them |
| [Character sheets](guides/character-sheets.md) | System packs, the compute pipeline, effects, durations, triggers, and roll templates |
| [3D dice](guides/3d-dice.md) | `DiceBox` setup, options, rolling API, themes, models, sounds, and selection |
| [Assets and rendering](guides/assets-and-rendering.md) | The lower-level building blocks: `@openvtt/assets`, `@openvtt/physics`, `@openvtt/render3d` |
| [Publishing](guides/publishing.md) | How the playground is deployed to Codeberg Pages and the docs mirrored to the wiki |

## Conventions

- **UUID v7 everywhere.** Every roll, event, effect instance, and sheet document ID is a time-ordered UUID v7 string.
- **Valibot for validation.** Public contracts (event payloads, roll IR, manifests, packs) all ship Valibot schemas you can reuse.
- **One event bus.** No package creates its own emitter; everything flows through `@openvtt/events` buses and hooks.
