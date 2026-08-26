import { describe, expect, it } from "vitest";
import { applyMediaProviderTemplate, mediaProviderTemplatesFor } from "./mediaProviderTemplates";

describe("media provider templates", () => {
  it("offers capability-specific templates and retains local endpoint/model overrides", () => {
    const template = mediaProviderTemplatesFor("music").find(item => item.id === "music-json-base64");
    expect(template).toBeTruthy();
    const applied = applyMediaProviderTemplate({ endpoint: "https://music.example.com/create", model: "my-music" }, template!);
    expect(applied).toMatchObject({ endpoint: "https://music.example.com/create", model: "my-music", providerTemplateId: "music-json-base64", resultPath: "data.audio", resultMimeType: "audio/mpeg" });
  });

  it("provides GMI Cloud Music 3.0's documented nested payload and status-query defaults without overwriting a proxy override", () => {
    const template = mediaProviderTemplatesFor("music").find(item => item.id === "music-gmi-minimax-3");
    expect(template).toBeTruthy();
    const defaults = applyMediaProviderTemplate({}, template!);
    expect(defaults).toMatchObject({ endpoint: "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests", model: "minimax-music-3.0", requestFormat: "json", pollEndpoint: "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests/{{id}}", resultPath: "outcome.audio_url" });
    expect(defaults.requestTemplate).toContain('"payload"');
    const proxied = applyMediaProviderTemplate({ endpoint: "https://music-proxy.example.com/gmi", model: "minimax-music-3.0" }, template!);
    expect(proxied.endpoint).toBe("https://music-proxy.example.com/gmi");
  });

  it("provides official defaults for OpenAI-compatible, SiliconFlow and MiniMax media services", () => {
    const siliconImage = applyMediaProviderTemplate({}, mediaProviderTemplatesFor("image").find(item => item.id === "image-siliconflow-official")!);
    const siliconSpeech = applyMediaProviderTemplate({}, mediaProviderTemplatesFor("speech").find(item => item.id === "speech-siliconflow-official")!);
    const minimaxMusic = applyMediaProviderTemplate({}, mediaProviderTemplatesFor("music").find(item => item.id === "music-minimax-official")!);
    const minimaxVideo = applyMediaProviderTemplate({}, mediaProviderTemplatesFor("video").find(item => item.id === "video-minimax-official")!);
    expect(siliconImage).toMatchObject({ endpoint: "https://api.siliconflow.cn/v1/images/generations", model: "black-forest-labs/FLUX.1-schnell" });
    expect(siliconSpeech).toMatchObject({ endpoint: "https://api.siliconflow.cn/v1/audio/speech", model: "fishaudio/fish-speech-1.5", voice: "fishaudio/fish-speech-1.5:alex" });
    expect(minimaxMusic).toMatchObject({ endpoint: "https://api.minimax.io/v1/music_generation", model: "music-3.0", resultPath: "data.audio", resultEncoding: "hex" });
    expect(minimaxVideo).toMatchObject({ endpoint: "https://api.minimax.io/v1/video_generation", model: "MiniMax-Hailuo-2.3", pollEndpoint: "https://api.minimax.io/v1/query/video_generation?task_id={{id}}", resultPath: "content.url" });
  });
});
