import { Context } from "@netlify/edge-functions";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,accept",
};

function mapPath(pathname: string): string {
  if (pathname === "/") return pathname;

  if (pathname === "/v1/chat/completions") {
    return "/v1beta/openai/v1/chat/completions";
  }

  if (pathname === "/v1/models") {
    return "/v1beta/openai/v1/models";
  }

  if (pathname.startsWith("/v1/")) {
    return "/v1beta/openai" + pathname;
  }

  return pathname;
}

function buildRequestHeaders(request: Request): Headers {
  const headers = new Headers();

  const contentType = request.headers.get("content-type");
  const authorization = request.headers.get("authorization");
  const accept = request.headers.get("accept");

  if (contentType) headers.set("content-type", contentType);
  if (authorization) headers.set("authorization", authorization);
  if (accept) headers.set("accept", accept);

  // 不要转发 accept-encoding，避免压缩响应被 Netlify 解压后头部还保留。
  return headers;
}

function buildResponseHeaders(response: Response): Headers {
  const headers = new Headers(CORS_HEADERS);

  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  headers.set("cache-control", "no-store");

  // 不复制 content-encoding / content-length / transfer-encoding。
  return headers;
}

export default async (request: Request, context: Context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const sourceUrl = new URL(request.url);

  if (sourceUrl.pathname === "/") {
    return new Response("Gemini OpenAI proxy is running.", {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  const targetPath = mapPath(sourceUrl.pathname);
  const targetUrl = new URL(
    targetPath,
    "https://generativelanguage.googleapis.com",
  );

  sourceUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: buildRequestHeaders(request),
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    duplex: "half",
  });

  return new Response(response.body, {
    status: response.status,
    headers: buildResponseHeaders(response),
  });
};
