This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

`npm run dev` is pinned to **port 3100** (see `package.json`). Open
[http://localhost:3100](http://localhost:3100) with your browser to see the result.
(Override the port with `npm run dev -- -p <port>` if you need to.)

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Talking to the Ajora engine (FastAPI)

The frontend never calls the FastAPI engine directly from the browser — the engine's
CORS allow-list covers the `:3000` and `:3100` dev origins and sends credentials, so a
cross-origin fetch from any other origin would be blocked. Instead, **Next proxies the
engine** via a server-side rewrite (see `next.config.ts`):

```
/api/engine/:path*   →   ${AJORA_API_BASE}/:path*
```

Because the rewrite runs server-side, the browser only ever makes **same-origin** calls
to `/api/engine/...`, so CORS never applies — regardless of which port Next runs on.

Set the engine base in `.env.local` (git-ignored):

```
AJORA_API_BASE=http://localhost:8000
```

`AJORA_API_BASE` is a **server-only** var (read when the Next server starts). For
staging/prod, point it at the deployed engine URL — no frontend code changes needed.

Run the engine from the repo root:

```bash
.venv/bin/python -m uvicorn api.main:app --port 8000
```

### Regenerating the API types

TypeScript types are generated from the engine's live OpenAPI schema with
[`openapi-typescript`](https://openapi-ts.dev) into `lib/api/engine-schema.d.ts`
(friendly aliases live in `lib/api/engine-types.ts`). With the engine running:

```bash
npm run gen:api
```

## Fonts

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load fonts.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
