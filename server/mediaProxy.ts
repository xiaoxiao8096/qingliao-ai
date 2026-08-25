import type { IncomingMessage, ServerResponse } from "node:http";

const TARGET_HEADER = "x-qingliao-upstream";
const MAX_REDIRECTS = 3;
const FORWARDED_REQUEST_HEADERS = [
  "authorization",
  "content-type",
  "accept",
] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-disposition",
  "cache-control",
  "etag",
  "last-modified",
] as const;

export function parseOriginList(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const url = new URL(item);
        if (url.protocol !== "https:")
          throw new Error(`只允许 HTTPS 域名：${item}`);
        return url.origin;
      })
  );
}

export function validateUpstreamTarget(
  rawTarget: string,
  allowedOrigins: Set<string>
) {
  if (!allowedOrigins.size) throw new Error("代理尚未配置上游域名白名单。");
  const target = new URL(rawTarget);
  if (target.protocol !== "https:") throw new Error("上游端点必须使用 HTTPS。");
  if (target.username || target.password)
    throw new Error("上游端点不能在 URL 中包含账号或密码。");
  if (!allowedOrigins.has(target.origin))
    throw new Error(`该上游域名未获允许：${target.origin}`);
  return target;
}

function requestOrigin(req: IncomingMessage) {
  return typeof req.headers.origin === "string" ? req.headers.origin : "";
}

function deploymentOrigin(req: IncomingMessage) {
  const hostHeader = req.headers["x-forwarded-host"] ?? req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) return "";
  const protocolHeader = req.headers["x-forwarded-proto"];
  const protocol =
    (Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader) ||
    "https";
  return `${protocol}://${host}`;
}

function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  allowedWebOrigins: Set<string>
) {
  const origin = requestOrigin(req);
  if (!origin) return true;
  if (origin !== deploymentOrigin(req) && !allowedWebOrigins.has(origin))
    return false;
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader(
    "access-control-allow-methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.setHeader(
    "access-control-allow-headers",
    "Authorization,Content-Type,X-Qingliao-Upstream"
  );
  res.setHeader(
    "access-control-expose-headers",
    "Content-Type,Content-Length,Content-Disposition"
  );
  res.setHeader("vary", "Origin");
  return true;
}

function json(
  res: ServerResponse,
  status: number,
  payload: Record<string, unknown>
) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", Buffer.byteLength(body));
  res.end(body);
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function requestHeaders(req: IncomingMessage) {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === "string") headers.set(name, value);
  }
  headers.set("user-agent", "Qingliao-Vercel-Media-Proxy/1.0");
  return headers;
}

async function fetchAllowed(
  target: URL,
  init: RequestInit,
  allowedOrigins: Set<string>
) {
  let current = target;
  let method = init.method ?? "GET";
  let body = init.body;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      ...init,
      method,
      body,
      redirect: "manual",
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    if (redirect === MAX_REDIRECTS) throw new Error("上游重定向次数过多。");
    current = validateUpstreamTarget(
      new URL(location, current).toString(),
      allowedOrigins
    );
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        method === "POST")
    ) {
      method = "GET";
      body = undefined;
    }
  }
  throw new Error("上游重定向次数过多。");
}

export async function handleMediaProxy(
  req: IncomingMessage,
  res: ServerResponse
) {
  let allowedOrigins: Set<string>;
  let allowedWebOrigins: Set<string>;
  try {
    allowedOrigins = parseOriginList(
      process.env.QINGLIAO_ALLOWED_UPSTREAM_ORIGINS
    );
    allowedWebOrigins = parseOriginList(
      process.env.QINGLIAO_ALLOWED_WEB_ORIGINS
    );
  } catch (error) {
    return json(res, 503, {
      code: "PROXY_CONFIG_INVALID",
      error: error instanceof Error ? error.message : "代理配置无效。",
    });
  }

  if (!applyCors(req, res, allowedWebOrigins))
    return json(res, 403, {
      code: "WEB_ORIGIN_FORBIDDEN",
      error: "该网页来源未获允许。",
    });
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (
    !req.method ||
    !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(req.method)
  ) {
    return json(res, 405, {
      code: "METHOD_NOT_ALLOWED",
      error: "该请求方法不受支持。",
    });
  }

  const rawTarget = req.headers[TARGET_HEADER];
  if (typeof rawTarget !== "string" || !rawTarget.trim()) {
    return json(res, 400, {
      code: "UPSTREAM_MISSING",
      error: "请求缺少上游端点。",
    });
  }

  let target: URL;
  try {
    target = validateUpstreamTarget(rawTarget, allowedOrigins);
  } catch (error) {
    return json(res, allowedOrigins.size ? 403 : 503, {
      code: allowedOrigins.size ? "UPSTREAM_FORBIDDEN" : "PROXY_NOT_CONFIGURED",
      error: error instanceof Error ? error.message : "上游端点无效。",
    });
  }

  try {
    const body = req.method === "GET" ? undefined : await readBody(req);
    const upstream = await fetchAllowed(
      target,
      { method: req.method, headers: requestHeaders(req), body },
      allowedOrigins
    );
    res.statusCode = upstream.status;
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader("x-qingliao-media-proxy", "1");
    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value)))
        await new Promise<void>(resolve => res.once("drain", resolve));
    }
    return res.end();
  } catch (error) {
    if (res.headersSent) return res.end();
    return json(res, 502, {
      code: "UPSTREAM_FAILED",
      error: error instanceof Error ? error.message : "代理无法访问上游服务。",
    });
  }
}
