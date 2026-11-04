# Ajora web app

The Next.js App Router frontend for savings circles and supporting financial
insights. It uses React, TypeScript, Tailwind, and TanStack Query.

## Run locally

Follow the root [Quick start](../README.md#quick-start) to install dependencies and
start the FastAPI API. From the repository root, start the frontend with:

```bash
npm --prefix web run dev
```

Open [localhost:3100](http://localhost:3100). Browser requests use the same-origin
`/api/engine/...` proxy configured in `next.config.ts`; the default API target is
`http://localhost:8000`.

To change the target, set `AJORA_API_BASE` in `web/.env.local`. For a production
build, set it before `npm --prefix web run build`: Next.js freezes the proxy target
at build time. This variable stays server-side.

## API types and checks

With the API running on port 8000, regenerate the OpenAPI types:

```bash
npm --prefix web run gen:api
```

The generated file is `lib/api/engine-schema.d.ts`; the feature-specific hooks in
`lib/api/` use its types.

```bash
npm --prefix web run lint
npm --prefix web run build
```

See [RUNNING.md](../RUNNING.md#browser-walkthrough) for the Playwright walkthrough
and isolated test state. App routes live in `app/`, shared UI in `components/`,
and API hooks and utilities in `lib/`.
