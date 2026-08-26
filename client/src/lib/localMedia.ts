import type { LocalAIProfile } from "./localProfiles";
import { saveLocalAsset, type AssetKind, type LocalAsset } from "./localAssets";
import { modelEndpoint } from "./localChat";

export type MediaCapability = "document" | "image" | "speech" | "music" | "video";
export type EndpointCapability = Exclude<MediaCapability, "document">;
type MediaConfig = NonNullable<NonNullable<LocalAIProfile["media"]>[EndpointCapability]>;

const JSON_MEDIA = "application/json";
const DEFAULT_VIDEO_POLL_LIMIT = 90;
const DEFAULT_VIDEO_POLL_DELAY = 2_000;
const GMI_CLOUD_MUSIC_ENDPOINT = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests";

export type VideoTaskUpdate = {
  stage: "submitting" | "queued" | "processing" | "downloading" | "completed" | "cancelled";
  progress: number;
  taskId?: string;
  message: string;
};

export type MediaGenerationOptions = {
  signal?: AbortSignal;
  onVideoTaskUpdate?: (update: VideoTaskUpdate) => void;
};

export type MediaCorsCheck =
  | { ok: true; endpoint: string; status: number; message: string }
  | { ok: false; endpoint: string; message: string };

export function defaultMediaEndpoint(baseUrl: string, capability: EndpointCapability) {
  const normalized = baseUrl.trim().replace(/\/$/, "").replace(/\/chat\/completions$/, "");
  if (!normalized) return "";
  const suffix: Record<EndpointCapability, string> = { image: "/images/generations", speech: "/audio/speech", music: "/audio/music", video: "/videos" };
  return `${normalized}${suffix[capability]}`;
}

export function mediaEndpointFor(profile: LocalAIProfile, capability: EndpointCapability) {
  return profile.media?.[capability]?.endpoint?.trim() || defaultMediaEndpoint(profile.baseUrl, capability);
}

export function mediaModelFor(profile: LocalAIProfile, capability: EndpointCapability) {
  return profile.media?.[capability]?.model?.trim() || profile.model.trim();
}

/** 该能力若单独填了 API Key 就用它，否则回落到顶层聊天用的 API Key。 */
export function mediaApiKeyFor(profile: LocalAIProfile, capability: EndpointCapability) {
  return profile.media?.[capability]?.apiKey?.trim() || profile.apiKey.trim();
}

export function defaultMediaRequestFormat(capability: EndpointCapability) {
  return capability === "video" ? "form" : "json";
}

function messageFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return "上游服务未返回可用内容。";
  const value = payload as { error?: { message?: string } | string; message?: string };
  if (typeof value.error === "string") return value.error;
  if (typeof value.error?.message === "string") return value.error.message;
  return value.message || "上游服务未返回可用内容。";
}

function fileNameFor(capability: MediaCapability, mimeType: string) {
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : mimeType.includes("mpeg") ? "mp3" : mimeType.includes("m4a") || mimeType.includes("audio/mp4") ? "m4a" : mimeType.includes("wav") ? "wav" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : capability === "document" ? "md" : "bin";
  const label: Record<MediaCapability, string> = { document: "ai-document", image: "ai-image", speech: "ai-speech", music: "ai-music", video: "ai-video" };
  return `${label[capability]}-${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}.${extension}`;
}

function configFor(profile: LocalAIProfile, capability: EndpointCapability): MediaConfig {
  return profile.media?.[capability] ?? {};
}

export function mediaNetworkFailureMessage(profile: LocalAIProfile, capability: EndpointCapability, endpoint = mediaEndpointFor(profile, capability)) {
  const config = configFor(profile, capability);
  if (capability === "music" && config.providerTemplateId === "music-gmi-minimax-3" && endpoint.replace(/\/$/, "") === GMI_CLOUD_MUSIC_ENDPOINT) {
    return "GMI Cloud Music 3.0 官方 console 端点未开放可携带 Authorization 的浏览器跨域调用；纯静态轻聊无法直连。请改填你自己部署且允许 CORS 的 HTTPS 代理端点，勿使用公共 CORS 代理或在页面暴露 API Key。";
  }
  return "浏览器无法访问该多模态端点。请检查 HTTPS、网络以及上游 CORS 配置。";
}

/**
 * 通过一个不含模型、提示词和真实 API Key 的空 JSON 请求触发浏览器预检。
 * 任何可读取的 HTTP 状态均表示 CORS 链路已通；这不是生成任务，也不验证账户权限。
 */
export async function checkMediaCors(profile: LocalAIProfile, capability: EndpointCapability, request: typeof fetch = fetch): Promise<MediaCorsCheck> {
  const endpoint = mediaEndpointFor(profile, capability);
  if (!endpoint) return { ok: false, endpoint, message: "请先填写该能力的 HTTPS 端点，或填写可推导默认端点的 API Base URL。" };
  try {
    const response = await request(endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "content-type": JSON_MEDIA, authorization: "Bearer qingliao-cors-probe" },
      body: "{}",
    });
    const authorizationHint = response.status === 401 || response.status === 403
      ? "上游已返回授权错误，说明浏览器跨域链路可用；此检测未使用你的 API Key。"
      : response.status >= 200 && response.status < 300
        ? "上游已可从浏览器读取；此检测未提交模型、提示词或真实 API Key。"
        : `上游返回 HTTP ${response.status}，但浏览器已可读取响应。请再用真实配置测试模型权限与参数。`;
    return { ok: true, endpoint, status: response.status, message: authorizationHint };
  } catch {
    return { ok: false, endpoint, message: mediaNetworkFailureMessage(profile, capability, endpoint) };
  }
}

function interpolateTemplate(value: unknown, values: Record<string, string>): unknown {
  if (typeof value === "string") return value.replace(/\{\{(model|prompt|voice|id)\}\}/g, (_match, key: string) => values[key] ?? "");
  if (Array.isArray(value)) return value.map(item => interpolateTemplate(item, values));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateTemplate(item, values)]));
  return value;
}

export function buildMediaRequestPayload(profile: LocalAIProfile, capability: EndpointCapability, prompt: string) {
  const model = mediaModelFor(profile, capability);
  const voice = profile.media?.speech?.voice?.trim() || "alloy";
  const defaults: Record<EndpointCapability, Record<string, unknown>> = {
    image: { model, prompt, size: "1024x1024", response_format: "b64_json" },
    speech: { model, input: prompt, voice, response_format: "mp3" },
    music: { model, prompt },
    video: { model, prompt },
  };
  const template = configFor(profile, capability).requestTemplate?.trim();
  if (!template) return defaults[capability];
  let parsed: unknown;
  try { parsed = JSON.parse(template); } catch { throw new Error("自定义请求 JSON 格式不正确。请检查括号、引号与逗号。"); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("自定义请求 JSON 必须是对象，例如 {\"model\":\"{{model}}\",\"prompt\":\"{{prompt}}\"}。");
  return interpolateTemplate(parsed, { model, prompt, voice, id: "" }) as Record<string, unknown>;
}

function valueAtPath(payload: unknown, path?: string) {
  if (!path?.trim()) return undefined;
  return path.trim().split(".").reduce<unknown>((current, key) => {
    if (Array.isArray(current)) return /^\d+$/.test(key) ? current[Number(key)] : undefined;
    if (current && typeof current === "object") return (current as Record<string, unknown>)[key];
    return undefined;
  }, payload);
}

function firstString(payload: unknown, paths: string[]) {
  for (const path of paths) {
    const value = valueAtPath(payload, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function decodeBase64(value: string, type = "application/octet-stream") {
  const decoded = atob(value.replace(/^data:[^;]+;base64,/, ""));
  const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
  return new Blob([bytes], { type: value.startsWith("data:") ? value.slice(5, value.indexOf(";")) : type });
}

function resultValue(payload: unknown, config: MediaConfig) {
  const custom = valueAtPath(payload, config.resultPath);
  if (typeof custom === "string" && custom.trim()) return custom.trim();
  return firstString(payload, ["data.0.b64_json", "data.0.url", "data.0.b64", "url", "output_url", "output.url", "result.url", "video_url", "content_url", "audio_url"]);
}

async function blobFromPayload(payload: unknown, config: MediaConfig, capability: EndpointCapability): Promise<Blob | null> {
  const value = resultValue(payload, config);
  if (!value) return null;
  if (/^(https?:)?\/\//i.test(value)) {
    const assetResponse = await fetch(value);
    if (!assetResponse.ok) throw new Error(`生成文件下载失败（${assetResponse.status}）。请确认服务允许跨域访问。`);
    return assetResponse.blob();
  }
  const defaultMime = capability === "image" ? "image/png" : capability === "speech" ? "audio/mpeg" : capability === "music" ? "audio/mpeg" : "video/mp4";
  try { return decodeBase64(value, config.resultMimeType?.trim() || defaultMime); } catch { throw new Error("生成结果不是可下载链接或 Base64 文件内容。请在高级配置中填写正确的结果字段路径。"); }
}

async function responseToBlob(response: Response, config: MediaConfig, capability: EndpointCapability): Promise<Blob> {
  const type = response.headers.get("content-type") || "";
  if (!type.includes(JSON_MEDIA)) return response.blob();
  const payload = await response.json().catch(() => null);
  const blob = await blobFromPayload(payload, config, capability);
  if (blob) return blob;
  throw new Error(messageFromPayload(payload));
}

function formatRequest(payload: Record<string, unknown>, format: "json" | "form"): { body: BodyInit; headers: HeadersInit } {
  if (format === "json") return { body: JSON.stringify(payload), headers: { "content-type": JSON_MEDIA } };
  const body = new FormData();
  Object.entries(payload).forEach(([key, value]) => body.append(key, typeof value === "string" ? value : JSON.stringify(value)));
  return { body, headers: {} };
}

function renderEndpoint(template: string, id: string) {
  return template.replaceAll("{{id}}", encodeURIComponent(id));
}

function statusOf(payload: unknown) {
  return firstString(payload, ["status", "data.status", "result.status"]).toLocaleLowerCase();
}

function idOf(payload: unknown) {
  return firstString(payload, ["id", "data.id", "job_id", "data.job_id", "task_id", "data.task_id", "request_id", "data.request_id"]);
}

function isDone(status: string) { return ["completed", "succeeded", "success", "done"].includes(status); }
function isFailed(status: string) { return ["failed", "error", "cancelled", "canceled", "expired"].includes(status); }
function sleep(milliseconds: number) { return new Promise(resolve => window.setTimeout(resolve, milliseconds)); }

export function videoTaskProgress(payload: unknown, status: string, attempt: number) {
  const reported = ["progress", "data.progress", "result.progress", "percentage", "data.percentage"].map(path => valueAtPath(payload, path)).find(value => typeof value === "number" || typeof value === "string");
  const number = typeof reported === "number" ? reported : Number(reported);
  if (Number.isFinite(number)) return Math.max(8, Math.min(96, number <= 1 ? Math.round(number * 100) : Math.round(number)));
  if (isDone(status)) return 96;
  if (status.includes("process") || status.includes("run")) return Math.min(88, 42 + attempt * 3);
  return Math.min(38, 18 + attempt * 2);
}

function abortError() {
  return new DOMException("已停止本机等待生成结果。", "AbortError");
}

function updateVideo(options: MediaGenerationOptions | undefined, update: VideoTaskUpdate) {
  options?.onVideoTaskUpdate?.(update);
}

async function waitForAsyncResult(profile: LocalAIProfile, capability: EndpointCapability, endpoint: string, startResponse: Response, options?: MediaGenerationOptions) {
  const config = configFor(profile, capability);
  const type = startResponse.headers.get("content-type") || "";
  if (!type.includes(JSON_MEDIA)) return responseToBlob(startResponse, config, capability);
  let payload = await startResponse.json().catch(() => null);
  const direct = await blobFromPayload(payload, config, capability);
  if (direct) return direct;
  const id = idOf(payload);
  if (!id) throw new Error("生成任务未返回结果文件或任务 ID。请检查端点响应，必要时在高级配置中填写结果字段路径。");
  const pollEndpoint = config.pollEndpoint?.trim() || `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(id)}`;
  const contentEndpoint = config.contentEndpoint?.trim() || `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(id)}/content`;
  let status = statusOf(payload);
  updateVideo(options, { stage: "queued", progress: videoTaskProgress(payload, status, 0), taskId: id, message: status ? `任务${status}` : "任务已创建，等待服务商处理" });
  for (let attempt = 0; attempt < DEFAULT_VIDEO_POLL_LIMIT; attempt += 1) {
    const needsInitialStatusFetch = attempt === 0 && Boolean(config.pollEndpoint?.trim());
    if (isDone(status) && !needsInitialStatusFetch) break;
    if (options?.signal?.aborted) throw abortError();
    if (isFailed(status)) throw new Error(`生成任务失败：${messageFromPayload(payload)}`);
    if (!needsInitialStatusFetch) await sleep(DEFAULT_VIDEO_POLL_DELAY);
    if (options?.signal?.aborted) throw abortError();
    let response: Response;
    try { response = await fetch(renderEndpoint(pollEndpoint, id), { headers: { authorization: `Bearer ${mediaApiKeyFor(profile, capability)}` }, signal: options?.signal }); } catch (error) { if (options?.signal?.aborted) throw abortError(); throw new Error("浏览器无法查询生成进度。请检查网络、HTTPS 和上游 CORS 配置。"); }
    if (!response.ok) throw new Error(`查询生成进度失败（${response.status}）。`);
    payload = await response.json().catch(() => null);
    const result = await blobFromPayload(payload, config, capability);
    if (result) return result;
    status = statusOf(payload);
    updateVideo(options, { stage: isDone(status) ? "downloading" : status.includes("process") || status.includes("run") ? "processing" : "queued", progress: videoTaskProgress(payload, status, attempt + 1), taskId: id, message: isDone(status) ? "生成完成，正在下载成品" : status ? `服务商状态：${status}` : "正在等待服务商处理" });
  }
  if (!isDone(status)) throw new Error("生成仍在排队或处理中。请保持页面打开后稍后重试；纯静态版本无法在关闭页面后继续代管任务。");
  if (options?.signal?.aborted) throw abortError();
  updateVideo(options, { stage: "downloading", progress: 96, taskId: id, message: "生成完成，正在下载成品" });
  let contentResponse: Response;
  try { contentResponse = await fetch(renderEndpoint(contentEndpoint, id), { headers: { authorization: `Bearer ${mediaApiKeyFor(profile, capability)}` }, signal: options?.signal }); } catch { if (options?.signal?.aborted) throw abortError(); throw new Error("生成已完成，但浏览器无法下载结果文件。请检查内容端点和 CORS 配置。"); }
  if (!contentResponse.ok) throw new Error(`下载生成结果失败（${contentResponse.status}）。`);
  return contentResponse.blob();
}

export async function cancelRemoteVideoTask(profile: LocalAIProfile, taskId: string) {
  const endpoint = profile.media?.video?.cancelEndpoint?.trim();
  if (!endpoint) return false;
  let response: Response;
  try {
    response = await fetch(renderEndpoint(endpoint, taskId), { method: "POST", headers: { authorization: `Bearer ${mediaApiKeyFor(profile, "video")}` } });
  } catch {
    throw new Error("浏览器无法通知服务商取消任务。已停止本机等待，请稍后到服务商控制台确认。\n");
  }
  if (!response.ok) throw new Error(`服务商取消任务失败（${response.status}）。已停止本机等待。`);
  return true;
}

export async function generateAndStoreMedia(profile: LocalAIProfile, capability: EndpointCapability, prompt: string, options?: MediaGenerationOptions): Promise<LocalAsset> {
  const endpoint = mediaEndpointFor(profile, capability);
  const model = mediaModelFor(profile, capability);
  const apiKey = mediaApiKeyFor(profile, capability);
  if (!endpoint || !apiKey || !model) throw new Error("请先为当前 AI 填写 API Key、模型和对应的多模态端点。");
  const config = configFor(profile, capability);
  const payload = buildMediaRequestPayload(profile, capability, prompt);
  const format = config.requestFormat ?? defaultMediaRequestFormat(capability);
  const request = formatRequest(payload, format);
  if (capability === "video") updateVideo(options, { stage: "submitting", progress: 8, message: "正在创建视频任务" });
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { ...request.headers, authorization: `Bearer ${apiKey}` }, body: request.body, signal: options?.signal });
  } catch {
    if (options?.signal?.aborted) throw abortError();
    throw new Error(mediaNetworkFailureMessage(profile, capability, endpoint));
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(`生成失败（${response.status}）：${messageFromPayload(payload)}`);
  }
  const blob = capability === "video" || config.pollEndpoint?.trim() ? await waitForAsyncResult(profile, capability, endpoint, response, options) : await responseToBlob(response, config, capability);
  const name = fileNameFor(capability, blob.type);
  const category: Record<EndpointCapability, string> = { image: "AI 图片", speech: "AI 语音", music: "AI 音乐", video: "AI 视频" };
  if (capability === "video") updateVideo(options, { stage: "completed", progress: 100, message: "视频已生成并保存到本机" });
  return saveLocalAsset(Object.assign(blob, { name }), { name, category: category[capability], source: "generated", generation: { capability, model, prompt, endpoint, parameters: payload, providerTemplateId: config.providerTemplateId } });
}

export async function generateAndStoreDocument(profile: LocalAIProfile, prompt: string, format: "markdown" | "html" | "text"): Promise<LocalAsset> {
  if (!profile.baseUrl.trim() || !profile.apiKey.trim() || !profile.model.trim()) throw new Error("请先为当前 AI 配置文本模型、API 地址与 API Key。");
  const instruction = format === "html" ? "请只输出可直接保存为 HTML 的完整源码，不要使用 Markdown 代码围栏。" : format === "markdown" ? "请只输出 Markdown 正文，不要使用代码围栏。" : "请只输出纯文本正文。";
  let response: Response;
  try {
    response = await fetch(modelEndpoint(profile.baseUrl), { method: "POST", headers: { "content-type": JSON_MEDIA, authorization: `Bearer ${profile.apiKey.trim()}` }, body: JSON.stringify({ model: profile.model.trim(), stream: false, messages: [{ role: "system", content: instruction }, { role: "user", content: prompt }] }) });
  } catch { throw new Error("浏览器无法访问文本生成端点。请检查 HTTPS、网络以及上游 CORS 配置。"); }
  const payload = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } | string } | null;
  if (!response.ok) throw new Error(`文档生成失败（${response.status}）：${messageFromPayload(payload)}`);
  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("文本模型没有返回可保存的文档内容。");
  const extension = format === "markdown" ? "md" : format === "html" ? "html" : "txt";
  const blob = new Blob([content], { type: format === "html" ? "text/html" : format === "markdown" ? "text/markdown" : "text/plain" });
  const name = `ai-document-${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}.${extension}`;
  return saveLocalAsset(Object.assign(blob, { name }), { name, category: "AI 文档", source: "generated", generation: { capability: "document", model: profile.model.trim(), prompt, endpoint: modelEndpoint(profile.baseUrl), parameters: { format, stream: false } } });
}

export type MediaTestResult = { ok: boolean; message: string; endpoint?: string };

export async function testMediaCapability(profile: LocalAIProfile, capability: EndpointCapability, prompt: string): Promise<MediaTestResult> {
  const endpoint = mediaEndpointFor(profile, capability);
  const model = mediaModelFor(profile, capability);
  const apiKey = mediaApiKeyFor(profile, capability);
  if (!endpoint || !apiKey || !model) {
    return { ok: false, message: "请先填写 API Key、模型和对应的多模态端点。", endpoint };
  }
  const config = configFor(profile, capability);
  const payload = buildMediaRequestPayload(profile, capability, prompt);
  const format = config.requestFormat ?? defaultMediaRequestFormat(capability);
  const request = formatRequest(payload, format);
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { ...request.headers, authorization: `Bearer ${apiKey}` }, body: request.body });
  } catch {
    return { ok: false, message: mediaNetworkFailureMessage(profile, capability, endpoint), endpoint };
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    return { ok: false, message: `生成失败（${response.status}）：${messageFromPayload(data)}`, endpoint };
  }
  const type = response.headers.get("content-type") || "";
  if (!type.includes(JSON_MEDIA)) {
    return { ok: true, message: "端点已返回文件，生成配置可用。", endpoint };
  }
  const data = await response.json().catch(() => null);
  const direct = await blobFromPayload(data, config, capability).catch(() => null);
  if (direct) return { ok: true, message: "成功取到生成结果，配置可用。", endpoint };
  const taskId = idOf(data);
  if (taskId) return { ok: true, message: "端点已创建异步任务，配置可用（视频类正常）。", endpoint };
  return { ok: false, message: "端点返回 200，但没找到结果字段；请在高级配置填写正确的结果路径。", endpoint };
}

export function capabilityLabel(capability: MediaCapability) {
  const labels: Record<MediaCapability, string> = { document: "文档", image: "图片", speech: "语音", music: "音乐", video: "视频" };
  return labels[capability];
}

export function generatedAssetKind(capability: MediaCapability): AssetKind {
  const kinds: Record<MediaCapability, AssetKind> = { document: "markdown", image: "image", speech: "audio", music: "audio", video: "video" };
  return kinds[capability];
}
