---
"@openvtt/canvas": minor
"@openvtt/canvas-plugin-drawings": patch
"@openvtt/canvas-plugin-walls": patch
"@openvtt/canvas-plugin-lights": patch
"@openvtt/canvas-plugin-tiles": patch
"@openvtt/canvas-plugin-tokens": patch
---

Placeable locking: documents gain a Valibot-validated `locked` flag (via the new core `LockableSchemaEntries`, spread into every plugin document schema). Locked placeables are skipped by pick/pickRect (opt out with `includeLocked`), drag, resize, rotate and delete; `canvas.setLocked()`/`canvas.toggleLock()` are undoable, batch document updates and drop locked objects from the selection. The context menu gains Lock/Unlock actions (mixed-selection aware, right-click re-picks locked objects) with a `Ctrl+L` hotkey, and Duplicate/Delete are disabled when the whole selection is locked.
