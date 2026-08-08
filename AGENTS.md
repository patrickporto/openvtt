# AGENTS.md

Diretrizes para agentes trabalhando no monorepo **openvtt**.

## Visão geral

Monorepo JavaScript/Typecript gerenciado por **Bun** (workspaces) + **Turborepo**.

- `packages/*` — bibliotecas publicáveis (`@openvtt/events`, `@openvtt/dice`, ...)
- `apps/*` — aplicações consumidoras (`playground`, ...)

## Comandos

Sempre executar da raiz do repo, exceto quando indicado.

| Tarefa       | Comando            |
| ------------ | ------------------ |
| Instalar     | `bun install`      |
| Build        | `bun run build`    |
| Dev          | `bun run dev`      |
| Testes       | `bun run test`     |
| Lint         | `bun run lint`     |
| Typecheck    | `bun run typecheck`|

Os scripts são delegados ao Turbo e rodam em todos os workspaces. Para escopar um pacote: `bun run <script> --filter=@openvtt/events`.

## Stack obrigatória

As decisões abaixo são padronizadas em todo o monorepo. Não introduzir alternativas sem discutir.

### Identificadores — UUID v7

Todo ID gerado no projeto **deve** usar **UUID v7** (time-ordered, sortable).

- Pacote: `uuid` (`^11`) — importar `v7`.
- No `@openvtt/events`, IDs de eventos/correlação já seguem isso via `newId()` em `packages/events/src/tracing.ts`.
- Em novos pacotes, gere IDs com `import { v7 } from 'uuid'`. Não use `v4`, `Math.random`, `crypto.randomUUID()` nem contadores auto-incrementados como identificadores públicos.

Exemplo:

```ts
import { v7 } from 'uuid';

const id = v7();
```

### Validação de schema — Valibot

Toda validação/parsing de contratos, eventos e dados de entrada **deve** usar **Valibot**.

- Pacote: `valibot` (`^1`).
- O `@openvtt/events` aceita schemas Valibot (`v.GenericSchema`) diretamente na definição de contratos; não é necessário converter tipos manualmente.
- Não usar `zod`, `joi`, `yup` ou `ajv`. Não inventar validação ad-hoc com `if`/guards quando um schema cobre o caso.

Exemplo:

```ts
import * as v from 'valibot';

const RollSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),   // IDs chegam como string UUID v7
  sides: v.pipe(v.number(), v.integer(), v.minValue(1)),
  result: v.number(),
});
```

### Eventos e hooks — `@openvtt/events`

Eventos (pub/sub) e hooks (taps/pipeline) em qualquer parte do monorepo **devem** ser geridos pelo pacote **`@openvtt/events`**.

- Workspace: `packages/events` → nome público `@openvtt/events`.
- Não criar `EventEmitter` próprio, instanciar `mitt`/`tapable` diretamente nem acoplar lógica de pub/sub aos componentes. Tudo passa pelo `EventBus`.
- Use `defineContract` (ou `createBus`) para declarar o conjunto tipado de **events** e **hooks**; passe os schemas Valibot correspondentes.

Uso típico:

```ts
import * as v from 'valibot';
import { createBus } from '@openvtt/events';

const bus = createBus({
  namespace: 'dice',
  events: {
    rolled: v.object({ result: v.number() }),
  },
  hooks: {
    beforeRoll: { strategy: 'syncWaterfall', schema: v.object({ sides: v.number() }) },
  },
});

bus.on('rolled', (payload, meta) => { /* ... */ });
bus.tap('beforeRoll', 'physics', (ctx) => ctx);
const result = bus.call('beforeRoll', { sides: 20 });
bus.emit('rolled', { result: 42 });
```

Estratégias de hook disponíveis: `sync`, `syncBail`, `syncWaterfall`, `asyncSeries`, `asyncSeriesBail`, `asyncSeriesWaterfall`, `asyncParallel`, `asyncParallelBail` (ver `packages/events/src/contract.ts`).

## Convenções de código

- **Sem comentários** salvo solicitação explícita.
- ESM puro (`"type": "module"`); build de pacotes com `tsup`, apps com `vite`.
- `strict` no TypeScript; rodar `bun run typecheck` antes de finalizar.
- Ao criar um novo pacote em `packages/*`, espelhe a estrutura de `packages/events` (`tsup.config.ts`, `tsconfig.json`, scripts `build`/`dev`/`test`/`typecheck`, campo `"exports"`).
