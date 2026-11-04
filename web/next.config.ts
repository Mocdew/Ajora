import type { NextConfig } from "next";

/**
 * Ajora frontend config.
 *
 * ── Engine proxy (no CORS) ───────────────────────────────────────────────────
 * The FastAPI engine's CORS allow-list includes the :3200 dev origin and
 * sends credentials, so a browser on any other origin would be blocked. Rather than
 * depend on that list, we proxy through the Next.js origin: the browser calls
 * same-origin `/api/engine/*`, and Next rewrites that to the engine server-side,
 * where CORS never applies.
 *
 * `AJORA_API_BASE` points at the engine (default http://localhost:8000). It is a
 * server-only var frozen into rewrites at build time. Vercel must point it at
 * the deployed HTTPS API; localhost is only a local-development fallback.
 */
const configuredApiBase = process.env.AJORA_API_BASE?.trim();
const onVercel = process.env.VERCEL === "1";
if (onVercel && !configuredApiBase) {
  throw new Error("Set AJORA_API_BASE in Vercel to the hosted FastAPI HTTPS URL before deploying.");
}
const apiUrl = new URL(configuredApiBase || "http://localhost:8000");
if (!(["http:", "https:"].includes(apiUrl.protocol)) || apiUrl.username || apiUrl.password
    || apiUrl.pathname !== "/" || apiUrl.search || apiUrl.hash) {
  throw new Error("AJORA_API_BASE must be an HTTP(S) API origin without a path, credentials, query, or fragment.");
}
if (onVercel && (apiUrl.protocol !== "https:" || ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(apiUrl.hostname))) {
  throw new Error("AJORA_API_BASE on Vercel must use the public HTTPS API URL, not localhost.");
}
const AJORA_API_BASE = apiUrl.origin;

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
