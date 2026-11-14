import { type NextRequest, NextResponse } from "next/server";

const stagingBranch = "codex/ajora-p0-staging";
const stagingApi = "https://ajora-p0-staging-api.onrender.com";
const enginePrefix = "/api/engine";
const apiHeaders = ["accept", "content-type", "origin", "sec-fetch-site", "idempotency-key", "x-ajora-actor"];
const apiCookies = new Set(["ajora_savings_session", "ajora_google_nonce"]);

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const enginePath = path === enginePrefix || path.startsWith(`${enginePrefix}/`);
  if (!enginePath || process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview"
      || process.env.VERCEL_GIT_COMMIT_REF !== stagingBranch) {
    return NextResponse.next();
  }

  // Vercel Deployment Protection authenticates the visitor. The relay
  // authenticates this Preview to the isolated API with an upstream-only header.
  const token = process.env.AJORA_STAGING_RELAY_TOKEN;
  if (!token || !/^[A-Za-z0-9_-]{43,128}$/.test(token)
      || process.env.AJORA_STAGING_API_BASE?.trim().replace(/\/$/, "") !== stagingApi) {
    return NextResponse.json({ detail: "Staging API access is unavailable." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }

  const headers = new Headers({ "X-Ajora-Staging-Access": token });
  for (const name of apiHeaders) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  // Keep Ajora sessions on the rewrite. Never forward Vercel's own cookies.
  const cookies = request.headers.get("cookie")?.split(";").map((item) => item.trim())
    .filter((item) => apiCookies.has(item.split("=", 1)[0]));
  if (cookies?.length) headers.set("cookie", cookies.join("; "));

  const destination = new URL(stagingApi);
  destination.pathname = path.slice(enginePrefix.length) || "/";
  destination.search = request.nextUrl.search;
  return NextResponse.rewrite(destination, { request: { headers } });
}

export const config = { matcher: "/api/engine/:path*" };
