# Ajora web — Next.js dashboard. Build context is ./web.
FROM node:20-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Install deps from the lockfile first (layer caching).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Both of these must be set BEFORE `next build`:
#  - NEXT_PUBLIC_* values are inlined into the client bundle at build time.
#  - next.config's rewrites() are evaluated at build time and frozen into
#    .next/routes-manifest.json, so the /api/engine -> API proxy target (AJORA_API_BASE)
#    must be present now; a runtime-only env is ignored by `next start`.
ARG NEXT_PUBLIC_USE_LIVE_API=1
ENV NEXT_PUBLIC_USE_LIVE_API=$NEXT_PUBLIC_USE_LIVE_API
ARG AJORA_API_BASE=http://api:8000
ENV AJORA_API_BASE=$AJORA_API_BASE
RUN npm run build

EXPOSE 3000

CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
