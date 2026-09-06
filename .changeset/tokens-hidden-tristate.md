---
'@openvtt/canvas-plugin-tokens': minor
---

The `Hidden` context-menu toggle is now mixed-state aware for
multi-selections: it renders an indeterminate dash when tokens diverge, and
activating it hides all tokens unless every selected token was already
hidden (then it shows all) — previously it applied the first token's
flipped state to the whole selection.
