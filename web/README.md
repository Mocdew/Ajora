# Ajora web app

The Next.js App Router frontend for savings circles and supporting financial
insights. It uses React, TypeScript, Tailwind, and TanStack Query.

## Run locally

Follow the root [Quick start](../README.md#quick-start) to install dependencies and
start the FastAPI API. From the repository root, start the frontend with:

```bash
npm --prefix web run dev
```

Open [localhost:3200](http://localhost:3200). Browser requests use the same-origin
`/api/engine/...` proxy configured in `next.config.ts`; the default API target is
`http://localhost:8000`.

To change the target, set `AJORA_API_BASE` in `web/.env.local`. For a production
build, set it before `npm --prefix web run build`: Next.js freezes the proxy target
at build time. This variable stays server-side.

## Deploy on Vercel

Import `Mocdew/Ajora` from GitHub with **Root Directory `web`** and the **Next.js**
framework preset. Set `AJORA_API_BASE` to the hosted API's HTTPS root before
building. Use `npm ci` to install and `npm run build` to build; Vercel manages the
deployed server, so local port 3200 does not need a Vercel port setting.

See [Deploying Ajora](../docs/DEPLOYMENT.md) for the free Render demo API,
authentication origins, and automatic GitHub deployments. That free API's
temporary accounts and circle records can reset on restart or deployment.

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
