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
 * The API target is frozen into rewrites at build time. Vercel previews require
 * an explicit staging origin. Local development defaults to localhost:8000.
 */
const onVercel = process.env.VERCEL === "1";
const preview = onVercel && process.env.VERCEL_ENV === "preview";
const primaryApiBase = process.env.AJORA_API_BASE?.trim();
const configuredApiBase = preview ? process.env.AJORA_STAGING_API_BASE?.trim() : primaryApiBase;
if (onVercel && !configuredApiBase) {
  const variable = preview ? "AJORA_STAGING_API_BASE" : "AJORA_API_BASE";
  throw new Error(`Set ${variable} in Vercel to the appropriate hosted FastAPI HTTPS origin before deploying.`);
}
if (preview && !primaryApiBase) {
  throw new Error("Set AJORA_API_BASE to the production API origin so Preview can verify separation.");
}
const apiUrl = new URL(configuredApiBase || "http://localhost:8000");
if (!(["http:", "https:"].includes(apiUrl.protocol)) || apiUrl.username || apiUrl.password
    || apiUrl.pathname !== "/" || apiUrl.search || apiUrl.hash) {
  throw new Error("AJORA_API_BASE must be an HTTP(S) API origin without a path, credentials, query, or fragment.");
}
if (onVercel && (apiUrl.protocol !== "https:" || ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(apiUrl.hostname))) {
  throw new Error("The API origin on Vercel must use the hosted HTTPS API URL.");
}
if (preview && primaryApiBase && apiUrl.origin === new URL(primaryApiBase).origin) {
  throw new Error("Vercel Preview and production must target separate API origins.");
}
const AJORA_API_BASE = apiUrl.origin;

const nextConfig: NextConfig = {
  // A production build must not delete chunks used by the running dev server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }];
  },
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
