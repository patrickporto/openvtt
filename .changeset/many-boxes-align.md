---
"@openvtt/canvas": minor
"@openvtt/canvas-plugin-templates": minor
"@openvtt/canvas-plugin-lights": patch
---

The selection box now rotates with the object. With a single object selected, the box, resize corner handles and the rotate handle are drawn on the object's oriented frame instead of its axis-aligned bounding box, so a rotated cone, ray, rectangle or tile keeps a tight selection that hugs the shape. Placeables expose the frame through the new `PlaceableObject.getSelectionFrame()` (`cx`, `cy`, `width`, `height`, `angle`), which `AoETemplate` overrides so cone/ray frames follow `direction` and the circle stays neutral.

The default frame (and `getAABB()`) previously assumed rotation happens around the center of the local bounds. That only holds for center-anchored placeables like tokens — corner-anchored ones (drawing rectangles/ellipses, tiles, whose Pixi container rotates around its origin) got a misplaced selection box after rotating, worst for square shapes. Both now derive the exact geometry by rotating the local rectangle: the frame rotates the local center offset around the origin, and `getAABB()` encloses the four rotated corners (which also fixes picking, marquee and spatial indexing for rotated corner-anchored placeables; centered placeables produce identical results to before). Multi-selections keep the combined axis-aligned box.
