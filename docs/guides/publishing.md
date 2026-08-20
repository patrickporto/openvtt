# Publishing

The playground is the live wiki, documentation and API reference for openvtt. Every push to `main` publishes it in two places on Codeberg, with no manual steps.

## What gets published

| Target | URL | Content |
|---|---|---|
| Codeberg Pages | `https://openvtt.codeberg.page/openvtt/` | The full playground app — home, labs and the wiki |
| Codeberg Wiki | `https://codeberg.org/openvtt/openvtt/wiki` | The markdown docs from `docs/`, flattened for the wiki UI |

## How it works

The pipeline lives in [`.woodpecker.yaml`](../../.woodpecker.yaml) at the repo root and has three steps:

1. **build-playground** — installs dependencies with Bun and builds the playground through Turborepo with `BASE_PATH=/<repo>/`, so the SPA works under the Pages subpath.
2. **publish-pages** — commits `apps/playground/dist` to the `pages` branch and force-pushes it. Codeberg Pages serves that branch at `/<owner>.codeberg.page/<repo>/`.
3. **publish-wiki** — clones the repo's wiki (`openvtt.wiki.git`), flattens the docs into wiki pages, rewrites cross-links and pushes:
   - `docs/README.md` → `Home.md`
   - `docs/guides/<name>.md` → `guide-<name>.md`
   - `docs/api/<name>.md` → `api-<name>.md`

The router uses hash URLs (`#/docs/...`), so the static build needs no server rewrites — any static host works.

## Setup (one time)

- Enable **Woodpecker CI** for the repository on Codeberg (repo → Settings → CI).
- Add a secret named `codeberg_token` containing an access token with `write:repository` scope (Settings → Applications → Access tokens).

## Running the release build locally

To reproduce exactly what gets deployed, including the subpath base:

```bash
BASE_PATH=/openvtt/ bun run build --filter=playground
```

The output in `apps/playground/dist` is self-contained and can be served from any static host.

## Editing docs

Docs are edited in `docs/` only — never in the wiki. The wiki is a read-only mirror regenerated on every push; manual wiki edits will be overwritten.
