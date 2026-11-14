export const enginePrefix = "/api/engine";

export type ApiService = { fetch(request: Request): Promise<Response> };

const apiHeaders = ["accept", "content-type", "origin", "sec-fetch-site", "idempotency-key", "x-ajora-actor"];
const apiCookies = new Set(["ajora_savings_session", "ajora_google_nonce"]);

export function isEngineRequest(url: URL) {
  return url.pathname === enginePrefix || url.pathname.startsWith(`${enginePrefix}/`);
}

export async function relayApi(request: Request, url: URL, options: {
  upstream: string;
  service?: ApiService;
  token?: string;
  accessHeader: string;
  unavailable: string;
}) {
  const { upstream, service, token, accessHeader, unavailable } = options;
  if (!token || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) {
    return Response.json({ detail: unavailable }, { status: 503 });
  }

  const headers = new Headers({ [accessHeader]: token });
  for (const name of apiHeaders) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const cookies = request.headers.get("cookie")?.split(";").map((item) => item.trim())
    .filter((item) => apiCookies.has(item.split("=", 1)[0]));
  if (cookies?.length) headers.set("cookie", cookies.join("; "));

  const target = new URL(upstream);
  target.pathname = url.pathname.slice(enginePrefix.length) || "/";
  target.search = url.search;
  if (service) {
    const clientIp = request.headers.get("CF-Connecting-IP");
    if (clientIp) headers.set("X-Ajora-Client-IP", clientIp);
  }
  try {
    const forwarded = new Request(new Request(target, request), {
      headers, cache: "no-store", redirect: "manual",
    });
    const response = await (service ? service.fetch(forwarded) : fetch(forwarded));
    if (response.status < 300 || response.status >= 400) return response;
    await response.body?.cancel();
  } catch {
    // Keep transport failures on the same origin so the app can report them.
  }
  return Response.json({ detail: unavailable }, { status: 502 });
}
