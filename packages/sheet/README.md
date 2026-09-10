# @openvtt/sheet

Engine de fichas de personagem orientada a efeitos. O documento guarda apenas **valores base** e **instâncias de efeito**; todo o resto — atributos finais, valores derivados, flags, bônus de rolagem — é recomputado por um pipeline determinístico e auditável sempre que algo muda. Eventos de ciclo de vida fluem por um bus do `@openvtt/events`.

## Instalação

```bash
bun add @openvtt/sheet
```

## Quickstart

```ts
import { createDocument, SheetEngine, defineSystemPack } from '@openvtt/sheet';

const pack = defineSystemPack({
  id: 'mini-dnd',
  version: '1.0.0',
  derived: { 'hp.max': '10 + con * 2' },
  definitions: [
    {
      id: 'blessed',
      label: 'Blessed',
      changes: [{ kind: 'value', path: 'str', op: 'add', value: '2' }],
    },
  ],
});

const doc = createDocument(pack, { base: { str: 3, con: 2 } });
const engine = new SheetEngine(doc, { pack });

engine.applyEffect('blessed');
const sheet = engine.compute();

sheet.values.str;        // 5
sheet.values['hp.max'];  // 14
sheet.audit;             // uma entrada por mudança aplicada
```

`compute()` é memoizado (mesma referência até a próxima mutação) e retorna um `ComputedSheet` **profundamente congelado** — não o mutate (strict mode lança `TypeError`).

## Conceitos

### SystemPack

Descreve as regras do sistema de jogo: escadas ordinais (`ordinals`), valores derivados (`derived`, path → fórmula), templates de rolagem (`rollTemplates`) e definições de efeito (`definitions`). `defineSystemPack(pack)` é um helper de authoring **identidade** (retorna o pack tipado, sem validar); a validação explícita é `validatePack(pack)`, que lança `PackValidationError`, e a engine a executa automaticamente no construtor (a menos que `validate: false`).

### EffectDefinition

Um efeito declara `changes` aplicadas à ficha enquanto ativo:

| Change | Forma | Efeito |
| ------ | ----- | ------ |
| `value` | `{ kind: 'value', path, op, value }` | `set`/`add`/`multiply` com fórmula; `upgrade`/`downgrade` em escada ordinal; `append`/`remove` em arrays |
| `roll` | `{ kind: 'roll', target, transform }` | transforma templates de rolagem casados por id, tag ou glob (`addDice`, `addModifiers`, `extraDice`, `bonus`) |
| `flag` | `{ kind: 'flag', path, value }` | escreve no namespace `flags.*`, visível a fórmulas e condições |

Campos adicionais: `condition` (fórmula que liga/desliga o efeito), `grants` (efeitos filhos aplicados e removidos em cascata), `priority`, `icon`.

### Triggers

Reagem a eventos do bus: `{ on, condition?, changes?, effect?, roll?, rollInto? }`. `roll` é fórmula (string) ou `RollExpr`; `rollInto: { path, op?: 'add' | 'subtract' | 'set' }` escreve o resultado em um path da base (default `subtract`). Cada disparo emite `trigger:fired` (e `trigger:roll` quando há rolagem).

### Durations

`duration: { unit, value?, event? }` com invariantes validadas: `value` obrigatório para `seconds`/`rounds`/`turns`, `event` obrigatório para `until-event`. Rounds/turns decaem nos eventos configurados via `durationEvents` (default `round:end`/`turn:end`); segundos decaem no `clockEvent` (default `clock:tick`, payload número ou `{ elapsed }`) ou via `engine.tickSeconds(n)`. A expiração emite `effect:expired` e cascateia para grants.

### Stacking

`stacking: { group?, mode? }` — `stack` (default: tudo aplica), `newest` (só a instância mais recente do grupo) ou `highest-priority`. Efeitos suprimidos aparecem em `computed.suppressed` com a razão (`disabled`/`stacking`/`condition`).

## Eventos e bus

`createSheetBus()` monta um bus pré-configurado com o contrato `sheet` (`effect:applied/removed/expired/enabled/disabled`, `computed`, `trigger:fired`, `trigger:roll`). Eventos de gameplay (`round:end`, `turn:start`, `clock:tick`, ...) devem ser declarados na opção `events`, que os funde ao contrato com tipagem completa — e compatibilidade com `unknownEvents: 'reject'`:

```ts
import * as v from 'valibot';
import { createSheetBus } from '@openvtt/sheet';

const bus = createSheetBus({
  events: {
    'round:end': v.object({}),
    'turn:end': v.object({}),
    'clock:tick': v.object({ elapsed: v.number() }),
  },
});

const engine = new SheetEngine(doc, { pack, bus });
engine.attach(); // a engine reage a qualquer evento do bus

bus.on('computed', ({ patches }) => ui.applyPatches(patches));
bus.emit('round:end', {}); // dispara triggers e decai durações
```

Com `attach()`, a engine processa triggers e durações a cada evento e reemite `computed` apenas quando algo realmente mudou (patches `{ path, previous, next }`).

## Serialização

`CharacterDocument` é JSON puro (`{ systemId, systemVersion, identity, base, effects }`). Para hidratar, use `engine.loadDocument(json)` — validado contra `characterDocumentSchema`, que **exige UUID em `effect.id`**. O gerador default da engine é UUID v7; geradores customizados via `SheetEngineOptions.id` devem produzir UUIDs se o documento for serializado e reidratado depois. Para ler o estado atual, `engine.document` retorna um `structuredClone` (não há método `snapshot()`).

```ts
const json = JSON.stringify(engine.document);
engine.loadDocument(JSON.parse(json));
```

## Documentação

- [Referência de API](../../docs/api/sheet.md)
- [Guia de character sheets](../../docs/guides/character-sheets.md)

## Desenvolvimento

`bun run build` · `bun run test` · `bun run typecheck` (a partir da raiz do monorepo, com `--filter=@openvtt/sheet`).
