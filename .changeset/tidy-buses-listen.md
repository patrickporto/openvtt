---
'@openvtt/events': patch
---

Fix `createBus({ namespace })` crashing when `events`/`hooks` are omitted: `normalizeContract` now requires all three contract keys before treating input as an already-normalized `Contract`.
