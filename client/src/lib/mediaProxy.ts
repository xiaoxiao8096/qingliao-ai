declare const __QINGLIAO_MEDIA_PROXY_URL__: string | undefined;

export function mediaProxyUrl() {
  if (typeof __QINGLIAO_MEDIA_PROXY_URL__ === "undefined") return "";
  return __QINGLIAO_MEDIA_PROXY_URL__.trim();
}

/**
 * Vercel 构建会把多模态请求送到同源代理；普通静态构建仍保持浏览器直连。
 * 上游完整地址只放在请求头里，不拼进代理 URL，避免查询字符串泄露。
 */
export function mediaRequestTarget(
  target: string,
  init: RequestInit = {},
  proxyUrl = mediaProxyUrl()
) {
  if (!proxyUrl) return { url: target, init };
  const headers = new Headers(init.headers);
  headers.set("x-qingliao-upstream", target);
  return { url: proxyUrl, init: { ...init, headers } };
}

export function mediaFetch(target: string, init: RequestInit = {}) {
  const request = mediaRequestTarget(target, init);
  return fetch(request.url, request.init);
}

export function usesMediaProxy() {
  return Boolean(mediaProxyUrl());
}
