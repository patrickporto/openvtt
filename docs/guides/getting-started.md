# Getting started

This guide gets you from a fresh clone to your first dice roll — both the deterministic, headless kind and the full 3D animated kind.

## Prerequisites

- [Bun](https://bun.sh) (the monorepo uses Bun workspaces)
- A modern browser, if you want to run the playground app

## Install

From the repository root:

```bash
bun install
```

## Repository layout

```
openvtt/
├── packages/           # Publishable libraries
│   ├── events/               # @openvtt/events      — event bus + hooks
│   ├── formula/              # @openvtt/formula     — expression language + AST
│   ├── dice-core/            # @openvtt/dice-core   — dice IR + evaluator
│   ├── dice-notation/        # @openvtt/dice-notation        — canonical parser
│   ├── dice-foundry-notation/# @openvtt/dice-foundry-notation — Foundry dialect
│   ├── dice-roll20-notation/ # @openvtt/dice-roll20-notation  — Roll20 dialect
│   ├── sheet/                # @openvtt/sheet       — character sheet engine
│   ├── 3ddice/               # @openvtt/dice        — 3D dice roller (DiceBox)
│   ├── physics/              # @openvtt/physics     — cannon-es worker physics
│   ├── render3d/             # @openvtt/render3d    — three.js toolkit
│   └── assets/               # @openvtt/assets      — asset manager
└── apps/
    └── playground/     # Vite demo app for the 3D dice roller
```

## Commands

All commands run from the repo root and are delegated to Turborepo, which fans them out to every workspace.

| Task | Command |
|---|---|
| Install dependencies | `bun install` |
| Build all packages | `bun run build` |
| Dev mode (watch) | `bun run dev` |
| Run tests | `bun run test` |
| Lint | `bun run lint` |
| Typecheck | `bun run typecheck` |

To scope a command to a single package, use `--filter` with the package name:

```bash
bun run test --filter=@openvtt/dice-core
bun run build --filter=@openvtt/events
```

## Run the playground

The playground (`apps/playground`) is a Vite app that exercises the 3D dice roller with theme, environment, shadow, and post-processing controls:

```bash
bun run dev --filter=playground
```

Vite prints a local URL (usually `http://localhost:5173`). The app serves dice assets from its `public/` directory, so `assetPath: '/'` works out of the box.

## Your first roll (headless)

The headless path uses the canonical notation parser plus the dice-core evaluator — no browser, no WebGL, fully deterministic when seeded.

```ts
import { fromFormula } from '@openvtt/dice-notation';
import { evaluateRoll } from '@openvtt/dice-core';

const expr = fromFormula('1d20 + @abilities.str.mod');

const result = evaluateRoll(expr, {
  seed: 'demo',
  scope: { abilities: { str: { mod: 3 } } },
});

console.log(result.value);
console.log(result.rolls.map((die) => die.value));
```

What happened:

1. `fromFormula` parsed the text into a `RollExpr` — a JSON-logic-shaped AST where `1d20` is a die-term leaf and `@abilities.str.mod` is a variable path.
2. `evaluateRoll` walked the AST, resolved `@abilities.str.mod` from the scope, rolled a d20 with a seeded RNG, and summed everything.
3. Because the seed is `'demo'`, running this again produces the exact same roll. See [Dice rolling](dice-rolling.md#deterministic-rolls) for details.

## Your first 3D roll (60 seconds)

The 3D path uses `@openvtt/dice` (package source in `packages/3ddice`). It needs a container element and served assets:

```html
<div id="dice-container" style="width: 100%; height: 400px"></div>
```

```ts
import { DiceBox } from '@openvtt/dice';

const container = document.querySelector<HTMLDivElement>('#dice-container')!;

const diceBox = new DiceBox(container, { assetPath: '/' });

diceBox.on('ready', async () => {
  const result = await diceBox.roll('2d20+1d6');
  console.log(result.notation, '→', result.total);
});

await diceBox.initialize();
```

Key points:

- `assetPath` is the URL prefix where dice textures, sounds, and environment maps are served. In the playground that is `/` (its `public/` folder).
- `initialize()` loads physics (in a Web Worker by default), theme assets, and the environment, then emits `ready`.
- `roll()` accepts the 3D box notation (sets joined by `+`, `-`, `*`, `/`) and resolves with a `RollResult` once the dice settle.

## Where to go next

- [Events and hooks](events-and-hooks.md) — the bus that ties everything together
- [Formulas](formulas.md) — the expression language behind `@abilities.str.mod`
- [Dice rolling](dice-rolling.md) — the full modifier catalogue and IR
- [Character sheets](character-sheets.md) — derived stats, effects, and roll templates
- [3D dice](3d-dice.md) — the complete `DiceBox` reference
