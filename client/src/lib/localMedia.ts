import { modelEndpoint } from "./localChat";
import type { LocalAIProfile } from "./localProfiles";
import { saveLocalAsset, type AssetKind, type LocalAsset } from "./localAssets";

export type MediaCapability = "document" | "image" | "speech" | "music" | "video";
export type EndpointCapability = Exclude<MediaCapability, "document">;

export function defaultMediaEndpoint(baseUrl: string, capability: EndpointCapability) {
  const normalized = baseUrl.trim().replace(/\/$/, "").replace(/\/chat\/completions$/, "");
  if (!normalized) return "";
  const suffix: Record<EndpointCapability, string> = { image: "/images/generations", speech: "/audio/speech", music: "/audio/music", video: "/videos/generations" };
  return `${normalized}${suffix[capability]}`;
}

export function mediaEndpointFor(profile: LocalAIProfile, capability: EndpointCapability) {
  return profile.media?.[capability]?.endpoint?.trim() || defaultMediaEndpoint(profile.baseUrl, capability);
}

export function mediaModelFor(profile: LocalAIProfile, capability: EndpointCapability) {
  return profile.media?.[capability]?.model?.trim() || profile.model.trim();
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

async function responseToBlob(response: Response): Promise<Blob> {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return response.blob();
  const payload = await response.json().catch(() => null) as { data?: Array<{ b64_json?: string; url?: string }>; url?: string; output_url?: string } | null;
  const candidate = payload?.data?.[0];
  if (candidate?.b64_json) {
    const decoded = atob(candidate.b64_json);
    const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
    return new Blob([bytes], { type: "image/png" });
  }
  const url = candidate?.url || payload?.url || payload?.output_url;
  if (url) {
    const assetResponse = await fetch(url);
    if (!assetResponse.ok) throw new Error(`生成文件下载失败（${assetResponse.status}）。请确认服务允许跨域访问。`);
    return assetResponse.blob();
  }
  throw new Error(messageFromPayload(payload));
}

export async function generateAndStoreMedia(profile: LocalAIProfile, capability: EndpointCapability, prompt: string): Promise<LocalAsset> {
  const endpoint = mediaEndpointFor(profile, capability);
  const model = mediaModelFor(profile, capability);
  if (!endpoint || !profile.apiKey.trim() || !model) throw new Error("请先为当前 AI 填写 API Key、模型和对应的多模态端点。");
  const body = capability === "speech"
    ? { model, input: prompt, voice: profile.media?.speech?.voice?.trim() || "alloy", response_format: "mp3" }
    : capability === "image"
      ? { model, prompt, size: "1024x1024", response_format: "b64_json" }
      : { model, prompt };
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${profile.apiKey.trim()}` }, body: JSON.stringify(body) });
  } catch {
    throw new Error("浏览器无法访问该多模态端点。请检查 HTTPS、网络以及上游 CORS 配置。");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(`生成失败（${response.status}）：${messageFromPayload(payload)}`);
  }
  const blob = await responseToBlob(response);
  const name = fileNameFor(capability, blob.type);
  const category: Record<EndpointCapability, string> = { image: "AI 图片", speech: "AI 语音", music: "AI 音乐", video: "AI 视频" };
  return saveLocalAsset(Object.assign(blob, { name }), { name, category: category[capability], source: "generated" });
}

export async function generateAndStoreDocument(profile: LocalAIProfile, prompt: string, format: "markdown" | "html" | "text"): Promise<LocalAsset> {
  if (!profile.baseUrl.trim() || !profile.apiKey.trim() || !profile.model.trim()) throw new Error("请先为当前 AI 配置文本模型、API 地址与 API Key。");
  const instruction = format === "html" ? "请只输出可直接保存为 HTML 的完整源码，不要使用 Markdown 代码围栏。" : format === "markdown" ? "请只输出 Markdown 正文，不要使用代码围栏。" : "请只输出纯文本正文。";
  let response: Response;
  try {
    response = await fetch(modelEndpoint(profile.baseUrl), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${profile.apiKey.trim()}` }, body: JSON.stringify({ model: profile.model.trim(), stream: false, messages: [{ role: "system", content: instruction }, { role: "user", content: prompt }] }) });
  } catch { throw new Error("浏览器无法访问文本生成端点。请检查 HTTPS、网络以及上游 CORS 配置。"); }
  const payload = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } | string } | null;
  if (!response.ok) throw new Error(`文档生成失败（${response.status}）：${messageFromPayload(payload)}`);
  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("文本模型没有返回可保存的文档内容。");
  const extension = format === "markdown" ? "md" : format === "html" ? "html" : "txt";
  const blob = new Blob([content], { type: format === "html" ? "text/html" : format === "markdown" ? "text/markdown" : "text/plain" });
  const name = `ai-document-${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}.${extension}`;
  return saveLocalAsset(Object.assign(blob, { name }), { name, category: "AI 文档", source: "generated" });
}

export function capabilityLabel(capability: MediaCapability) {
  const labels: Record<MediaCapability, string> = { document: "文档", image: "图片", speech: "语音", music: "音乐", video: "视频" };
  return labels[capability];
}

export function generatedAssetKind(capability: MediaCapability): AssetKind {
  const kinds: Record<MediaCapability, AssetKind> = { document: "markdown", image: "image", speech: "audio", music: "audio", video: "video" };
  return kinds[capability];
}
