import type { NextConfig } from "next";

/**
 * Ajora frontend config.
 *
 * ── Engine proxy (no CORS) ───────────────────────────────────────────────────
 * The FastAPI engine's CORS allow-list covers the :3000 and :3100 dev origins and
 * sends credentials, so a browser on any other origin would be blocked. Rather than
 * depend on that list, we proxy through the Next.js origin: the browser calls
 * same-origin `/api/engine/*`, and Next rewrites that to the engine server-side,
 * where CORS never applies.
 *
 * `AJORA_API_BASE` points at the engine (default http://localhost:8000). It is a
 * server-only var (read at build/start of the Next server), so prod just sets it
 * to the deployed engine URL — no frontend code changes.
 */
const AJORA_API_BASE = (
  process.env.AJORA_API_BASE ?? "http://localhost:8000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/engine/:path*",
        destination: `${AJORA_API_BASE}/:path*`,
      },
    ];
  },
};

export default nextConfig;
