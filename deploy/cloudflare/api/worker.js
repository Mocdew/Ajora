import { Container } from "@cloudflare/containers";
import { WorkerEntrypoint } from "cloudflare:workers";

const upstreamHeaders = [
  "accept", "content-type", "cookie", "origin", "sec-fetch-site",
  "idempotency-key", "x-ajora-actor",
];

function isStagingDatabase(value) {
  const url = URL.parse(value ?? "");
  return url !== null && ["libsql:", "https:"].includes(url.protocol)
    && url.hostname === "ajora-p0-staging-olumide.aws-us-west-2.turso.io"
    && ["", "/"].includes(url.pathname) && !url.username && !url.password
    && !url.port && !url.search && !url.hash;
}

export class AjoraApiContainer extends Container {
  defaultPort = 8000;
  pingEndpoint = "container/health";
  sleepAfter = "2m";
  enableInternet = true;

  envVars = {
    AJORA_STATE_DIR: "/tmp/ajora-state",
    AJORA_REQUIRE_REMOTE_SAVINGS: "true",
    AJORA_STAGING_ACCESS_REQUIRED: "true",
    AJORA_MANUAL_SAVINGS_ENABLED: "true",
    AJORA_COOKIE_SECURE: "true",
    AJORA_EXPLAINER: "offline",
    AJORA_AUTH_ORIGINS: this.env.AJORA_AUTH_ORIGINS,
    AJORA_STAGING_ACCESS_TOKEN: this.env.AJORA_STAGING_ACCESS_TOKEN,
    TURSO_DATABASE_URL: this.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: this.env.TURSO_AUTH_TOKEN,
    // The private Worker is the only ingress and replaces forwarding headers.
    FORWARDED_ALLOW_IPS: "*",
  };
}

export class AjoraStagingApi extends WorkerEntrypoint {
  async fetch(request) {
    const { AJORA_STAGING_ACCESS_TOKEN, AJORA_AUTH_ORIGINS, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = this.env;
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(AJORA_STAGING_ACCESS_TOKEN ?? "")
        || !AJORA_AUTH_ORIGINS?.trim() || !isStagingDatabase(TURSO_DATABASE_URL) || !TURSO_AUTH_TOKEN?.trim()) {
      return Response.json({ detail: "Staging API is unavailable." }, {
        status: 503, headers: { "Cache-Control": "no-store" },
      });
    }

    const headers = new Headers({
      "X-Ajora-Staging-Access": AJORA_STAGING_ACCESS_TOKEN,
      "X-Forwarded-Proto": "https",
    });
    for (const name of upstreamHeaders) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    // The frontend binding replaces this internal header with Cloudflare's client address.
    const clientIp = request.headers.get("X-Ajora-Client-IP");
    if (clientIp && /^[0-9a-f:.]{3,45}$/i.test(clientIp)) headers.set("X-Forwarded-For", clientIp);

    const { pathname, search } = new URL(request.url);
    const upstream = new Request(`http://container${pathname}${search}`, request);
    return this.env.API_CONTAINER.getByName("staging").fetch(new Request(upstream, { headers, redirect: "manual" }));
  }
}

export default {
  fetch() {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  },
};
