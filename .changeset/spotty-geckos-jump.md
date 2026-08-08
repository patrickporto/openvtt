---
"@openvtt/events": minor
---

Add `@openvtt/events`: a schema-validated event + hook bus (mitt + tapable +
valibot + uuid v7) that serves as the OpenVTT hook foundation.

- Typed & freeform event notifications (mitt) with wildcards and sync emit.
- Hook pipelines (tapable): sync / syncBail / syncWaterfall and async
  series / parallel / bail / waterfall strategies.
- Valibot payload validation (`throw` | `warn` | `off`).
- UUID v7 event/correlation ids via `newId()`.
- Browser-extension & external-script bridge: global `__OPENVTT_EVENTS__`
  handle plus DOM `CustomEvent` dispatch on `document`.
- Optional cross-tab `BroadcastChannel` with loop/echo protection.
- Handler error isolation, `onError` observer, runtime event/hook
  registration, and full destroy/teardown.
