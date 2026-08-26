import type { EndpointCapability } from "./localMedia";
import type { LocalAIProfile } from "./localProfiles";

type EndpointSettings = NonNullable<NonNullable<LocalAIProfile["media"]>[EndpointCapability]>;

export type MediaProviderTemplate = {
  id: string;
  capability: EndpointCapability;
  name: string;
  note: string;
  browserNotice?: string;
  estimatedWaitMinutes?: { min: number; max: number };
  settings: Partial<EndpointSettings>;
};

const templates: MediaProviderTemplate[] = [
  { id: "image-openai", capability: "image", name: "OpenAI 兼容图片", note: "标准 images/generations 与 Base64 图片", settings: { requestFormat: "json" } },
  { id: "image-openai-official", capability: "image", name: "OpenAI 图片（官方）", note: "gpt-image-1 与标准图片生成路径", browserNotice: "请先检测 CORS。OpenAI 官方密钥不应暴露在公开网页；纯静态直连是否可用以实际检测为准。", settings: { endpoint: "https://api.openai.com/v1/images/generations", model: "gpt-image-1", requestFormat: "json" } },
  { id: "image-siliconflow-official", capability: "image", name: "硅基流动图片（官方）", note: "FLUX.1-schnell 与 OpenAI 兼容图片路径", browserNotice: "请先检测 CORS；模板不保证上游允许浏览器直连。", settings: { endpoint: "https://api.siliconflow.cn/v1/images/generations", model: "black-forest-labs/FLUX.1-schnell", requestFormat: "json", resultPath: "images.0.url" } },
  { id: "image-json-url", capability: "image", name: "通用 JSON 图片链接", note: "JSON 请求，读取 data.0.url", settings: { requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', resultPath: "data.0.url" } },
  { id: "speech-openai", capability: "speech", name: "OpenAI 兼容语音", note: "标准 audio/speech 请求与二进制音频", settings: { requestFormat: "json" } },
  { id: "speech-openai-official", capability: "speech", name: "OpenAI 语音（官方）", note: "gpt-4o-mini-tts、alloy 与二进制 MP3", browserNotice: "请先检测 CORS。公开纯静态页面不应暴露 OpenAI API Key。", settings: { endpoint: "https://api.openai.com/v1/audio/speech", model: "gpt-4o-mini-tts", voice: "alloy", requestFormat: "json" } },
  { id: "speech-siliconflow-official", capability: "speech", name: "硅基流动语音（官方）", note: "Fish Speech 1.5 与二进制音频返回", browserNotice: "请先检测 CORS；模板不保证上游允许浏览器直连。", settings: { endpoint: "https://api.siliconflow.cn/v1/audio/speech", model: "fishaudio/fish-speech-1.5", voice: "fishaudio/fish-speech-1.5:alex", requestFormat: "json" } },
  { id: "music-json-url", capability: "music", name: "通用音乐链接", note: "JSON 请求，读取 data.audio_url", settings: { requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', resultPath: "data.audio_url" } },
  { id: "music-json-base64", capability: "music", name: "通用音乐 Base64", note: "JSON 请求，读取 data.audio 的 MP3", settings: { requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', resultPath: "data.audio", resultMimeType: "audio/mpeg" } },
  { id: "music-gmi-minimax-3", capability: "music", name: "GMI Cloud Music 3.0（需代理）", note: "官方嵌套 payload、request_id 查询与 outcome.audio_url 下载", browserNotice: "GMI Cloud 官方 console 端点当前未开放可携带授权头的浏览器跨域调用；纯静态页面不能直连，需改填你自己的 HTTPS 代理端点。", settings: { endpoint: "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests", model: "minimax-music-3.0", requestFormat: "json", requestTemplate: '{"model":"{{model}}","payload":{"lyrics":"{{prompt}}","sample_rate":44100,"bitrate":256000,"format":"mp3"}}', pollEndpoint: "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests/{{id}}", resultPath: "outcome.audio_url" } },
  { id: "music-minimax-official", capability: "music", name: "MiniMax 音乐（官方）", note: "Music 3.0 的歌词、风格与十六进制音频返回", browserNotice: "请先检测 CORS；服务商返回的音频与浏览器下载是否可用以实际检测为准。", settings: { endpoint: "https://api.minimax.io/v1/music_generation", model: "music-3.0", requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}","lyrics":"{{prompt}}","audio_setting":{"sample_rate":44100,"bitrate":256000,"format":"mp3"}}', resultPath: "data.audio", resultMimeType: "audio/mpeg", resultEncoding: "hex" } },
  { id: "video-openai-async", capability: "video", name: "标准异步视频", note: "表单创建、查询进度并下载成品", settings: { requestFormat: "form", requestTemplate: "", pollEndpoint: "", contentEndpoint: "" } },
  { id: "video-json-async", capability: "video", name: "通用 JSON 异步视频", note: "JSON 创建任务，默认以任务 ID 轮询", settings: { requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', pollEndpoint: "", contentEndpoint: "" } },
  { id: "video-json-url", capability: "video", name: "通用视频链接", note: "直接从 JSON 的 output.url 下载视频", settings: { requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', resultPath: "output.url" } },
  { id: "video-minimax-official", capability: "video", name: "MiniMax 视频（官方）", note: "Hailuo 2.3：创建任务、轮询 content.url 并下载", browserNotice: "请先检测 CORS；任务查询与结果下载必须同样允许浏览器跨域读取。", estimatedWaitMinutes: { min: 1, max: 5 }, settings: { endpoint: "https://api.minimax.io/v1/video_generation", model: "MiniMax-Hailuo-2.3", requestFormat: "json", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}","duration":6,"resolution":"768P"}', pollEndpoint: "https://api.minimax.io/v1/query/video_generation?task_id={{id}}", resultPath: "content.url" } },
];

export function mediaProviderTemplatesFor(capability: EndpointCapability) {
  return templates.filter(template => template.capability === capability);
}

export function applyMediaProviderTemplate(current: EndpointSettings | undefined, template: MediaProviderTemplate): EndpointSettings {
  const { endpoint, model, ...requestSettings } = template.settings;
  return { ...current, ...requestSettings, endpoint: current?.endpoint?.trim() || endpoint, model: current?.model?.trim() || model, providerTemplateId: template.id };
}
