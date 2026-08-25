import { describe, expect, it } from "vitest";
import { applyMediaProviderTemplate, mediaProviderTemplatesFor } from "./mediaProviderTemplates";

describe("media provider templates", () => {
  it("offers capability-specific templates and retains local endpoint/model overrides", () => {
    const template = mediaProviderTemplatesFor("music").find(item => item.id === "music-json-base64");
    expect(template).toBeTruthy();
    const applied = applyMediaProviderTemplate({ endpoint: "https://music.example.com/create", model: "my-music" }, template!);
    expect(applied).toMatchObject({ endpoint: "https://music.example.com/create", model: "my-music", providerTemplateId: "music-json-base64", resultPath: "data.audio", resultMimeType: "audio/mpeg" });
  });
});
