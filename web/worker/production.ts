import app from "vinext/server/app-router-entry";
import { isEngineRequest, relayApi, type ApiService } from "./api-relay";

type Env = NonNullable<Parameters<typeof app.fetch>[1]> & {
  AJORA_API?: ApiService;
  AJORA_PRODUCTION_RELAY_TOKEN?: string;
};

export default {
  async fetch(request: Request, env: Env, ctx: Parameters<typeof app.fetch>[2]) {
    const url = new URL(request.url);
    if (!isEngineRequest(url)) return app.fetch(request, env, ctx);

    const unavailable = "Ajora’s API is temporarily unavailable.";
    const response = env.AJORA_API ? await relayApi(request, url, {
      upstream: "https://ajora-production-api.internal",
      service: env.AJORA_API,
      token: env.AJORA_PRODUCTION_RELAY_TOKEN,
      accessHeader: "X-Ajora-Production-Access",
      unavailable,
    }) : Response.json({ detail: unavailable }, { status: 503 });
    const result = new Response(response.body, response);
    result.headers.set("Cache-Control", "private, no-store");
    result.headers.set("X-Content-Type-Options", "nosniff");
    return result;
  },
};
