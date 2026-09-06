---
"@openvtt/canvas": minor
"@openvtt/canvas-plugin-templates": minor
---

Templates now rotate around their origin: the cone pivots on its tip and the ray on its emitting point, so rotating a spell template sweeps it in place instead of orbiting the center of its bounding box (which also made the selection box jump around during the gesture). Types declare the pivot through the new `TransformAdapter.rotationPivot(obj)` — when a single object is selected, `SelectRotating` uses it as the rotation center via `HandlesLayer.getRotationCenter()`; multi-selections and types without a declared pivot keep rotating around the selection AABB center.
