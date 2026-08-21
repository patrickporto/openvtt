# Publishing

The playground is the live wiki, documentation and API reference for openvtt. Every push to `main` publishes it automatically to [Render](https://render.com) as a static site served over a global CDN.

## What gets published

| Target | URL | Content |
|---|---|---|
| Render static site | `https://openvtt-playground.onrender.com` | The full playground app — home, labs and the wiki |

The router uses hash URLs (`#/docs/...`), so the static build needs no server rewrites and works on any static host.

## How it works

Render builds natively from Git — but it only connects to GitHub and GitLab, while the canonical repository lives on Codeberg. The setup bridges that with a mirror:

```
git push → Codeberg (canonical)
              └─ push mirror → GitHub (deploy-only copy)
                                   └─ Render auto-deploy → CDN
```

The site itself is defined as code in [`render.yaml`](../../render.yaml) at the repo root:

- **runtime** `static` with free CDN, TLS, Brotli and HTTP/2.
- **buildCommand** installs Bun (via npm), runs `bun install` and builds the playground through Turborepo. `SKIP_INSTALL_DEPS=true` disables Render's npm/yarn auto-detection since the monorepo uses Bun workspaces.
- **staticPublishPath** serves `apps/playground/dist`.
- **headers** cache hashed assets (`/assets/*`, textures, environments) for a year and keep `index.html` fresh.

## Setup (one time)

1. **Create the GitHub mirror** — create an empty repo on GitHub (e.g. `openvtt/openvtt`), then on Codeberg go to *Settings → Repository → Mirroring*, add a **push mirror** to `https://github.com/<user>/openvtt.git` authenticated with a GitHub token (`contents:write`). Codeberg pushes every commit automatically.
2. **Create the Render Blueprint** — on [dashboard.render.com](https://dashboard.render.com), *New → Blueprint*, connect the GitHub account and select the mirrored repo. Render reads `render.yaml` and provisions the static site.
3. Done — every push to `main` mirrors to GitHub and Render redeploys with zero-downtime and immediate cache invalidation.

## Running the release build locally

The build is a plain Turborepo invocation; `BASE_PATH` defaults to `/` for root-domain hosting:

```bash
bun run build --filter=playground
```

The output in `apps/playground/dist` is self-contained and can be served from any static host.

## Editing docs

Docs are edited in `docs/` only. They are bundled into the app at build time via `import.meta.glob`, so the published wiki always matches the repo — no separate publication step.
