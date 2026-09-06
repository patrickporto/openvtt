# `@openvtt/canvas-plugin-window` — Design

Data: 2026-08-17
Status: aprovado

## Objetivo

Plugin de gerenciamento de janelas para `@openvtt/canvas`: criar janelas flutuantes
com fechar, mover (drag, mouse + touch), minimizar, maximizar, redimensionar,
docking por borda, snapping e persistência de estado. O image editor passa a
exigir este plugin e abre como janela flutuante (com opção `modal`).

## Arquitetura

Novo pacote `packages/canvas-plugin-window` (`@openvtt/canvas-plugin-window`),
estrutura espelhada de `packages/events` (tsup, tsconfig, exports, scripts).

**`WindowsPlugin`** (id `'windows'`), plugin não-documental:

- Overlay DOM absoluto sobre o stage (`pointer-events: none`; janelas, backdrop
  e taskbar recebem `auto` — o canvas continua recebendo input onde não há janela).
- Taskbar no rodapé: um botão por janela flutuante minimizada (título); clique
  restaura e foca. Oculta quando vazia.
- Foco/z-order: clique traz a janela para frente (z-index monotônico); janela
  focada destaca título/borda. `modal: true` cria backdrop acima de tudo,
  bloqueando o canvas; `Esc` fecha a menos que a janela seja `persistent`.
- Dispose via `ctx.onDispose` remove overlay, janelas e listeners.

**`<openvtt-window-frame>`** (Shadow DOM): barra de título com botões
minimizar/maximizar/fechar (cada um omitível via `closable/minimizable/
maximizable`), área de conteúdo, 8 handles de resize. Pointer Events +
`setPointerCapture` (mouse e touch unificados). Duplo-clique no título alterna
maximizar. Clamp mantém a janela visível dentro do overlay.

## API

Registro declarativo — conteúdo lazy, instanciado na primeira abertura:

```ts
ctx.registerWindow({
  id: 'imageEditor',
  title: 'Token editor',
  factory: (ctx) => buildContent(),
  width: 320, height: 520,
  modal: false, closable: true,
});
windows.open('imageEditor');
```

**`WindowManager`** (via `canvas.plugins.get('windows')`):

| Método | |
|---|---|
| `create(def): WindowHandle` | janela imperativa ad-hoc |
| `open(id, overrides?): WindowHandle` | abre definição registrada (foca se já aberta) |
| `get(id) / list(): WindowHandle[]` | lookup |
| `closeAll() / minimizeAll()` | lote |
| `serialize(): WindowState[] / restore(states)` | persistência (host decide onde salvar) |
| `setOptions({ taskbar, snap })` | defaults globais |

Eventos no bus (schemas Valibot, ids UUID v7): `window:created`,
`window:closed`, `window:state` (`normal|minimized|maximized`), `window:dock`,
`window:focus`, `window:blur`.

**`WindowHandle`**: `close()`, `focus()`, `minimize()`, `restore()`,
`maximize()`, `moveTo()`, `resizeTo()`, `dock(edge)`, `undock()`,
`setConstraints({ minWidth, minHeight, maxWidth, maxHeight, aspectRatio? })`,
propriedades `state/dock/element` e `on('close'|'focus'|'blur'|'state'|'dock', fn)`.

Estilização: CSS custom properties `--ovtt-*` + shadow parts (`panel`,
`titlebar`, `content`, `resize-handle`).

## Docking

- `dock: 'left' | 'right' | 'bottom'` na criação ou `handle.dock(edge)`.
- Janela docada é reparenteada para um dock panel da borda (coluna lateral ou
  faixa inferior), redimensionável pela borda interna.
- Stack simples: várias janelas na mesma borda empilham; minimizada dentro do
  dock colapsa para a própria barra de título (taskbar é só para flutuantes).
- `undock()` devolve ao modo flutuante na última posição livre conhecida.
- Maximizar numa janela docada expande para toda a área do dock.

## Snapping

- Flutuantes, durante drag e resize: perto de borda do overlay ou de janela
  irmã (threshold ~12px) a janela gruda com highlight; soltar confirma.
- `Alt` desativa snapping durante o gesto.
- Zonas de dock durante drag: arrastar sobre borda da tela mostra preview;
  soltar doca.

## Persistência

```ts
type WindowState = {
  id: string; definitionId?: string;
  x: number; y: number; width: number; height: number;
  state: 'normal' | 'minimized' | 'maximized';
  dock: 'float' | 'left' | 'right' | 'bottom';
  stackIndex?: number; zIndex?: number;
};
```

`restore()` recria registered windows por `definitionId` (re-chamando a
factory); ad-hoc só com `serializeContent/restoreContent` opcionais na
definição. Estados órfãos são ignorados silenciosamente.

## Integração

- Image editor: `dependencies: ['windows']`; `open()` chama
  `windows.open('imageEditor', ...)` com `<openvtt-image-editor>` como
  conteúdo (sem botão ✕ próprio — o frame cuida do close). Eventos
  `imageEditor:opened/applied` mantidos.
- Preset standard: `windowsPlugin` antes do `imageEditorPlugin`.
- Playground: remove posicionamento manual; salva `serialize()` no
  localStorage e `restore()` no boot; demo de janela docada à direita.

## Testes

Manager (create/open/foca, close/closeAll, eventos, serialize/restore
round-trip, órfãos), frame (states, modal+Esc, clamping, constraints),
docking (dock/undock, stack, taskbar), snapping (helper puro `computeSnap`),
integração (preset instala 13 plugins, duplo-clique abre janela).
