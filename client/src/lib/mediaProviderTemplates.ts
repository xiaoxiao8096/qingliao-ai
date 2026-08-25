import type { EndpointCapability } from "./localMedia";
import type { LocalAIProfile } from "./localProfiles";

type EndpointSettings = NonNullable<NonNullable<LocalAIProfile["media"]>[EndpointCapability]>;

export type MediaProviderTemplate = {
  id: string;
  capability: EndpointCapability;
  name: string;
  note: string;
  settings: Partial<EndpointSettings>;
};

const templates: MediaProviderTemplate[] = [
  { id: "image-openai", capability: "image", name: "OpenAI 兼容图片", note: "标准 images/generations 与 Base64 图片", settings: { requestFormat: "json" } },
  { id: "image-json-url", capability: "image", name: "通用 JSON 图片链接", note: "JSON 请求，读取 data.0.url", settings: { requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', resultPath: "data.0.url" } },
  { id: "speech-openai", capability: "speech", name: "OpenAI 兼容语音", note: "标准 audio/speech 请求与二进制音频", settings: { requestFormat: "json" } },
  { id: "music-json-url", capability: "music", name: "通用音乐链接", note: "JSON 请求，读取 data.audio_url", settings: { requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', resultPath: "data.audio_url" } },
  { id: "music-json-base64", capability: "music", name: "通用音乐 Base64", note: "JSON 请求，读取 data.audio 的 MP3", settings: { requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', resultPath: "data.audio", resultMimeType: "audio/mpeg" } },
  { id: "video-openai-async", capability: "video", name: "标准异步视频", note: "表单创建、查询进度并下载成品", settings: { requestFormat: "form", requestTemplate: "", pollEndpoint: "", contentEndpoint: "" } },
  { id: "video-json-async", capability: "video", name: "通用 JSON 异步视频", note: "JSON 创建任务，默认以任务 ID 轮询", settings: { requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', pollEndpoint: "", contentEndpoint: "" } },
  { id: "video-json-url", capability: "video", name: "通用视频链接", note: "直接从 JSON 的 output.url 下载视频", settings: { requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', resultPath: "output.url" } },
];

export function mediaProviderTemplatesFor(capability: EndpointCapability) {
  return templates.filter(template => template.capability === capability);
}

export function applyMediaProviderTemplate(current: EndpointSettings | undefined, template: MediaProviderTemplate): EndpointSettings {
  return { ...current, ...template.settings, providerTemplateId: template.id };
}
