import { describe, expect, it } from "vitest";
import { defaultMediaEndpoint, capabilityLabel, generatedAssetKind } from "./localMedia";

describe("local media endpoint helpers", () => {
  it("derives OpenAI-compatible media paths from a text API base URL", () => {
    expect(defaultMediaEndpoint("https://api.example.com/v1", "image")).toBe("https://api.example.com/v1/images/generations");
    expect(defaultMediaEndpoint("https://api.example.com/v1/chat/completions", "speech")).toBe("https://api.example.com/v1/audio/speech");
    expect(defaultMediaEndpoint("", "video")).toBe("");
  });

  it("maps each creation capability to a clear asset target", () => {
    expect(capabilityLabel("music")).toBe("音乐");
    expect(generatedAssetKind("video")).toBe("video");
    expect(generatedAssetKind("document")).toBe("markdown");
  });
});
