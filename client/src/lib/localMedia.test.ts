import { describe, expect, it } from "vitest";
import { buildMediaRequestPayload, checkMediaCors, defaultMediaEndpoint, defaultMediaRequestFormat, capabilityLabel, generatedAssetKind, mediaApiKeyFor, mediaNetworkFailureMessage, videoTaskProgress } from "./localMedia";

describe("local media endpoint helpers", () => {
  it("derives OpenAI-compatible media paths from a text API base URL", () => {
    expect(defaultMediaEndpoint("https://api.example.com/v1", "image")).toBe("https://api.example.com/v1/images/generations");
    expect(defaultMediaEndpoint("https://api.example.com/v1/chat/completions", "speech")).toBe("https://api.example.com/v1/audio/speech");
    expect(defaultMediaEndpoint("https://api.example.com/v1", "video")).toBe("https://api.example.com/v1/videos");
    expect(defaultMediaEndpoint("", "video")).toBe("");
  });

  it("builds OpenAI-compatible image and speech bodies and supports custom provider templates", () => {
    const profile = { baseUrl: "https://api.example.com/v1", apiKey: "test", model: "fallback", media: { speech: { model: "tts", voice: "nova" }, music: { model: "music", requestTemplate: '{"text":"{{prompt}}","engine":"{{model}}"}' } } } as any;
    expect(buildMediaRequestPayload(profile, "image", "a blue bird")).toMatchObject({ model: "fallback", prompt: "a blue bird", size: "1024x1024", response_format: "b64_json" });
    expect(buildMediaRequestPayload(profile, "speech", "你好")).toMatchObject({ model: "tts", input: "你好", voice: "nova", response_format: "mp3" });
    expect(buildMediaRequestPayload(profile, "music", "lofi")).toEqual({ text: "lofi", engine: "music" });
    expect(defaultMediaRequestFormat("video")).toBe("form");
    expect(defaultMediaRequestFormat("music")).toBe("json");
  });

  it("builds GMI Cloud Music 3.0's nested payload and explains its browser CORS boundary", () => {
    const profile = { baseUrl: "https://api.example.com/v1", apiKey: "test", model: "fallback", media: { music: { endpoint: "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests", model: "minimax-music-3.0", providerTemplateId: "music-gmi-minimax-3", requestTemplate: '{"model":"{{model}}","payload":{"lyrics":"{{prompt}}","format":"mp3"}}' } } } as any;
    expect(buildMediaRequestPayload(profile, "music", "[Verse] 夜色落下")).toEqual({ model: "minimax-music-3.0", payload: { lyrics: "[Verse] 夜色落下", format: "mp3" } });
    expect(mediaNetworkFailureMessage(profile, "music")).toContain("纯静态轻聊无法直连");
    expect(mediaNetworkFailureMessage({ ...profile, media: { music: { ...profile.media.music, endpoint: "https://music-proxy.example.com/gmi" } } }, "music")).toContain("HTTPS、网络以及上游 CORS");
  });

  it("lets each capability carry its own API key and falls back to the chat key", () => {
    const profile = { baseUrl: "https://api.b.com/v1", apiKey: "key-chat-b", model: "chat", media: { image: { apiKey: "key-image-a" }, speech: { apiKey: "   " } } } as any;
    expect(mediaApiKeyFor(profile, "image")).toBe("key-image-a");
    expect(mediaApiKeyFor(profile, "speech")).toBe("key-chat-b");
    expect(mediaApiKeyFor(profile, "video")).toBe("key-chat-b");
    expect(mediaApiKeyFor({ ...profile, apiKey: "" }, "image")).toBe("key-image-a");
    expect(mediaApiKeyFor({ ...profile, apiKey: "" }, "music")).toBe("");
  });

  it("checks every media endpoint through a credential-free browser CORS probe without creating content", async () => {
    const profile = { baseUrl: "https://api.example.com/v1", apiKey: "private-key", model: "fallback", media: { image: { endpoint: "https://media.example.com/images" } } } as any;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const result = await checkMediaCors(profile, "image", async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response("unauthorized", { status: 401 });
    });
    expect(result).toMatchObject({ ok: true, endpoint: "https://media.example.com/images", status: 401 });
    expect(result.message).toContain("未使用你的 API Key");
    expect(requests[0]).toMatchObject({ url: "https://media.example.com/images", init: { method: "POST", body: "{}", credentials: "omit" } });
    expect((requests[0].init?.headers as Record<string, string>).authorization).toBe("Bearer qingliao-cors-probe");
  });

  it("reports a capability-specific CORS boundary when the browser cannot reach a media endpoint", async () => {
    const profile = { baseUrl: "https://api.example.com/v1", apiKey: "test", model: "fallback", media: { music: { endpoint: "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests", providerTemplateId: "music-gmi-minimax-3" } } } as any;
    const result = await checkMediaCors(profile, "music", async () => { throw new TypeError("Failed to fetch"); });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("纯静态轻聊无法直连");
  });

  it("maps each creation capability to a clear asset target", () => {
    expect(capabilityLabel("music")).toBe("音乐");
    expect(generatedAssetKind("video")).toBe("video");
    expect(generatedAssetKind("document")).toBe("markdown");
  });

  it("derives safe visible progress from provider status payloads", () => {
    expect(videoTaskProgress({ data: { progress: 0.46 } }, "processing", 3)).toBe(46);
    expect(videoTaskProgress({}, "queued", 2)).toBeGreaterThanOrEqual(18);
    expect(videoTaskProgress({}, "completed", 8)).toBe(96);
  });
});
