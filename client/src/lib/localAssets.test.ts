import { describe, expect, it } from "vitest";
import { assetKindLabel, classifyAsset, formatAssetSize, normalizeAssetCategory } from "./localAssets";

describe("local asset classification", () => {
  it("classifies common creative files into previewable kinds", () => {
    expect(classifyAsset("cover.webp", "image/webp")).toBe("image");
    expect(classifyAsset("voice.mp3", "audio/mpeg")).toBe("audio");
    expect(classifyAsset("clip.mp4", "video/mp4")).toBe("video");
    expect(classifyAsset("draft.md", "text/markdown")).toBe("markdown");
    expect(classifyAsset("slides.pptx")).toBe("pptx");
    expect(classifyAsset("contract.docx")).toBe("docx");
  });

  it("normalizes categories and readable storage metadata", () => {
    expect(normalizeAssetCategory("  灵感 作品  ", "image")).toBe("灵感 作品");
    expect(normalizeAssetCategory("", "audio")).toBe(assetKindLabel("audio"));
    expect(formatAssetSize(1024 * 1024 * 3.2)).toBe("3.2 MB");
  });
});
