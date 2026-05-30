import { Context } from "@netlify/edge-functions";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "*",
  "access-control-allow-headers": "*",
};

const pickHeaders = (headers: Headers, keys: (string | RegExp)[]): Headers => {
  const picked = new Headers();
  for (const key of headers.keys()) {
    if (keys.some((k) => (typeof k === "string" ? k === key : k.test(key)))) {
      const value = headers.get(key);
      if (typeof value === "string") picked.set(key, value);
    }
  }
  return picked;
};

function mapPath(pathname: string): string {
  if (pathname === "/") return pathname;

  // ScreenMemo Custom 默认会请求 /v1/chat/completions 和 /v1/models
  // 这里改到 Gemini 官方 OpenAI 兼容路径。
  if (pathname === "/v1/chat/completions") {
    return "/v1beta/openai/v1/chat/completions";
  }

  if (pathname === "/v1/models") {
    return "/v1beta/openai/v1/models";
  }

  if (pathname.startsWith("/v1/")) {
    return "/v1beta/openai" + pathname;
  }

  // 其他 Gemini 原生路径保持原样转发
  return pathname;
}

export default async (request: Request, context: Context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const { pathname, searchParams } = new URL(request.url);

  if (pathname === "/") {
    return new Response("Gemini proxy is running.", {
      headers: { ...CORS_HEADERS, "content-type": "text/plain" },
    });
  }

  const targetPath = mapPath(pathname);
  const url = new URL(targetPath, "https://generativelanguage.googleapis.com");

  searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });

  const headers = pickHeaders(request.headers, [
    "content-type",
    "authorization",
    "x-goog-api-client",
    "x-goog-api-key",
    "accept",
    "accept-encoding",
  ]);

  const response = await fetch(url, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    duplex: "half",
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      ...CORS_HEADERS,
      ...Object.fromEntries(response.headers),
    },
  });
};
