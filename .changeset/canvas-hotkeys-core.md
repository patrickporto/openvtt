---
'@openvtt/canvas': minor
---

Integrate `@openvtt/hotkeys` as the single keyboard layer: `CanvasOptions.hotkeys` accepts a shared manager (one is created and managed otherwise), `ToolManager` registers rebindable actions (`canvas/tool:*` from core and plugin contributions, `canvas/undo`, `canvas/redo`, `canvas/ping`, `canvas/pan`) and `RootState` no longer interprets keys — tool switching, undo/redo, ping and space/middle temp pan now flow through the hotkey engine with conflict detection and layout-independent matching. Plugin `ctx.registerTool({ hotkey })` is unchanged.
