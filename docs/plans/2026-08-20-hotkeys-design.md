# `@openvtt/hotkeys` — Design

Data: 2026-08-20
Status: aprovado

## Objetivo

Pacote de gerenciamento de hotkeys para o monorepo: registro declarativo de ações
com binds padrão, rebinding pelo usuário, detecção de conflitos e persistência
validada por schema. Paridade com o sistema de keybindings do Foundry VTT
(multiplos binds, `onDown`/`onUp`, `repeat`, `reservedModifiers`, `precedence`,
`editable`) e melhorias por cima:

- **Contextos** — ações escopadas (`canvas`, `sheet`, `chat`) ativáveis em runtime;
  Foundry não tem escopo de primeira classe.
- **Detecção de conflitos** — `conflicts()` reporta combos compartilhados com
  contexto e precedência, prontos para uma UI de configurações.
- **Matching independente de layout** — sempre por `event.code` (`KeyA`, `Digit1`,
  `Numpad3`), com fallback para `event.key`.
- **Persistência difada** — o profile guarda apenas overrides diferentes dos
  defaults (`{ version: 1, overrides: { "ns/action": ["ctrl+shift+p"] } }`),
  validado com Valibot e aplicado atomicamente.
- **Observabilidade** — eventos (`hotkeyTriggered`, `bindsChanged`,
  `contextsChanged`, `hotkeyError`) e hook de veto (`beforeHotkey`,
  syncWaterfall) via `@openvtt/events`.

## Arquitetura

Novo pacote `packages/hotkeys`, estrutura espelhada de `packages/events`.

- `keys.ts` — normalização de códigos físicos para tokens canônicos (`KeyA` →
  `a`, `Numpad3` → `numpad3`, `ControlLeft` → `ctrl`), aliases de modificadores
  (`Cmd`/`Win` → `meta`, `Option` → `alt`), `parseCombo`/`formatCombo`/
  `comboId` e `matchesBind` (modificadores exatos, exceto reservados).
- `schema.ts` — schemas Valibot: `KeyBind` (id UUID v7), `HotkeyProfile`,
  payloads de eventos e do hook.
- `registry.ts` — `ActionRegistry`: registro/desregistro, defaults vs overrides,
  `setBinds`/`reset`, `conflicts()` (dedupe por ação, agrupado por combo).
- `engine.ts` — `KeyEngine`: attach/detach de listeners, pipeline de dispatch
  (filtro de inputs, repeat, contexto), ordenação por `precedence` desc e ordem
  de registro, preventDefault/stopPropagation quando um handler retorna `true`,
  isolamento de erros com emissão de `hotkeyError`, veto via hook.
- `manager.ts` — `HotkeyManager`: fachada (registro, rebind, contexts,
  attach/detach, `handle` headless para testes), bus tipado próprio ou injetado,
  `serialize()`/`applyProfile()`.

## Resolução de conflitos

1. Ações ordenadas por `precedence` (desc), empate pela ordem de registro.
2. Cada handler executa em ordem; retorno `true` reivindica o evento
   (`preventDefault` + `stopPropagation`, configurável) e encerra o dispatch.
3. Handler que lança emite `hotkeyError` e o dispatch segue para a próxima ação.

## Persistência

- `serialize()` só emite overrides que diferem dos defaults (comparação por
  `comboId` como conjunto).
- `applyProfile(unknown)` valida shape, ações existentes, editabilidade e sintaxe
  de cada combo antes de aplicar qualquer coisa; falha lança `InvalidProfileError`
  com issues/cause.
- IDs de binds são UUID v7 (`uuid`/`v7`), conforme convenção do monorepo.

## Decisões

- Sem chords (sequências estilo VS Code) na v1 — contexts + precedência cobrem
  os casos de uso; chords podem entrar depois sem quebrar o profile.
- `restricted` (só GM) fica fora do pacote: autorização é responsabilidade do
  consumidor, que pode vetar via hook `beforeHotkey`.
- `keyup` usa o mesmo matching do keydown (sem rastreio de estado entre fases);
  documentado que mudanças de contexto entre down/up podem suprimir o `onUp`.
