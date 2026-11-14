import { timingSafeEqual } from "node:crypto";
import app from "vinext/server/app-router-entry";
import { isEngineRequest, relayApi, type ApiService } from "./api-relay";

const stagingApi = "https://ajora-p0-staging-api.onrender.com";

type StagingEnv = NonNullable<Parameters<typeof app.fetch>[1]> & {
  AJORA_API?: ApiService;
  AJORA_STAGING_RELAY_TOKEN?: string;
  AJORA_STAGING_WEB_PASSWORD?: string;
};

async function authorized(header: string, password: string) {
  const scheme = /^Basic\s+/i.exec(header);
  if (!scheme) return false;
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(header.slice(scheme[0].length))),
    crypto.subtle.digest("SHA-256", encoder.encode(btoa(`ajora-staging:${password}`))),
  ]);
  return timingSafeEqual(new Uint8Array(actual), new Uint8Array(expected));
}

export default {
  async fetch(request: Request, env: StagingEnv, ctx: Parameters<typeof app.fetch>[2]) {
    const password = env.AJORA_STAGING_WEB_PASSWORD;
    if (!password || !/^[A-Za-z0-9_-]{43,128}$/.test(password)) {
      return new Response("Staging is unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (!await authorized(request.headers.get("authorization") ?? "", password)) {
      return new Response("Staging credentials required.", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Ajora staging"', "Cache-Control": "no-store" },
      });
    }

    const url = new URL(request.url);
    let response: Response;
    if (isEngineRequest(url)) {
      response = await relayApi(request, url, {
        upstream: env.AJORA_API ? "https://ajora-staging-api.internal" : stagingApi,
        service: env.AJORA_API,
        token: env.AJORA_STAGING_RELAY_TOKEN,
        accessHeader: "X-Ajora-Staging-Access",
        unavailable: "Staging API is unavailable.",
      });
    } else {
      const headers = new Headers(request.headers);
      headers.delete("authorization");
      const appRequest = new Request(request, { headers });
      // vinext assumes Cloudflare serves these files before its app handler.
      // Staging serves them here so the same authentication covers assets.
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/_next/static/") && env.ASSETS) {
        response = await env.ASSETS.fetch(appRequest);
      } else {
        response = await app.fetch(appRequest, env, ctx);
      }
    }
    const result = new Response(response.body, response);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  },
};
