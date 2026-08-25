import { describe, expect, it } from "vitest";
import { buildMediaRequestPayload, defaultMediaEndpoint, defaultMediaRequestFormat, capabilityLabel, generatedAssetKind, mediaNetworkFailureMessage, videoTaskProgress } from "./localMedia";

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
