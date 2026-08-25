import { miniPreviewRadius, miniPreviewTexture } from "@/lib/themePreview";
import { describe, expect, it } from "vitest";

describe("left theme appearance preview", () => {
  it("renders distinct bubble geometry for each radius option", () => {
    expect(miniPreviewRadius("soft")).toContain("0.25rem");
    expect(miniPreviewRadius("rounded")).toContain("1rem");
    expect(miniPreviewRadius("pill")).toBe("1.25rem");
  });

  it("maps all background textures to visible preview styles", () => {
    const base = { accent: "violet" as const, fontScale: "medium" as const, bubbleRadius: "rounded" as const };
    expect(miniPreviewTexture({ ...base, chatTexture: "plain" }).backgroundColor).toBe("#f7fafc");
    expect(miniPreviewTexture({ ...base, chatTexture: "dots" }).backgroundImage).toContain("radial-gradient");
    expect(miniPreviewTexture({ ...base, chatTexture: "grid" }).backgroundImage).toContain("linear-gradient");
    expect(miniPreviewTexture({ ...base, chatTexture: "paper" }).backgroundImage).toContain("repeating-linear-gradient");
  });
});
