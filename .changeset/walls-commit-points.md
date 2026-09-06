---
"@openvtt/canvas-plugin-walls": patch
---

Fix wall history handling and scene menu targeting: `commitWallPoints` now records the current segments (instead of the pre-gesture snapshot) so undo restores the right state, history batching is guarded when no history manager is installed, and the walls scene context menu also opens on wall selections.
