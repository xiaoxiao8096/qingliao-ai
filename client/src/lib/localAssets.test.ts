import { describe, expect, it } from "vitest";
import { assetKindLabel, classifyAsset, formatAssetSize, normalizeAssetCategory, normalizeGenerationInfo } from "./localAssets";

describe("local asset classification", () => {
  it("classifies common creative files into previewable kinds", () => {
    expect(classifyAsset("cover.webp", "image/webp")).toBe("image");
    expect(classifyAsset("voice.mp3", "audio/mpeg")).toBe("audio");
    expect(classifyAsset("clip.mp4", "video/mp4")).toBe("video");
    expect(classifyAsset("draft.md", "text/markdown")).toBe("markdown");
    expect(classifyAsset("slides.pptx")).toBe("pptx");
    expect(classifyAsset("legacy-slides.ppt")).toBe("pptx");
    expect(classifyAsset("contract.docx")).toBe("docx");
    expect(classifyAsset("legacy-contract.doc")).toBe("docx");
  });

  it("normalizes categories and readable storage metadata", () => {
    expect(normalizeAssetCategory("  灵感 作品  ", "image")).toBe("灵感 作品");
    expect(normalizeAssetCategory("", "audio")).toBe(assetKindLabel("audio"));
    expect(formatAssetSize(1024 * 1024 * 3.2)).toBe("3.2 MB");
  });

  it("stores bounded generation provenance without exposing credentials", () => {
    expect(normalizeGenerationInfo({ capability: "video", model: " video-model ", prompt: "  a cat  ", endpoint: " https://video.example.com ", parameters: { prompt: "a cat", seconds: 8 }, providerTemplateId: "video-json-async" }, 100)).toEqual({ capability: "video", model: "video-model", prompt: "a cat", endpoint: "https://video.example.com", parameters: { prompt: "a cat", seconds: 8 }, providerTemplateId: "video-json-async", generatedAt: 100 });
  });
});
