import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendLocalMessages, conversationsForAI, createConversation } from "./localChat";
import {
  BUILTIN_AI_THEMES,
  DEFAULT_PROMPT_SHORTCUTS,
  createAppearancePreset,
  createAIProfile,
  getActiveAIId,
  getAIProfiles,
  getAppearancePresets,
  getUserProfile,
  saveAppearancePresets,
  saveAIProfiles,
  saveUserProfile,
  setActiveAIId,
} from "./localProfiles";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("local multi-AI profiles", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates separate AI profiles and persists the selected active AI", () => {
    const initial = getAIProfiles();
    const second = { ...createAIProfile(), id: "second-ai", name: "写作助手", baseUrl: "https://api.example.com/v1", apiKey: "sk-second", model: "example-model" };
    saveAIProfiles([...initial, second]);
    setActiveAIId("second-ai");

    expect(getAIProfiles()).toHaveLength(2);
    expect(getAIProfiles().find(profile => profile.id === "second-ai")?.name).toBe("写作助手");
    expect(getActiveAIId()).toBe("second-ai");
  });

  it("persists independent appearance themes for different AI profiles", () => {
    const initial = getAIProfiles()[0];
    const second = { ...createAIProfile(), id: "second-ai", name: "写作助手", appearance: { accent: "violet" as const, fontScale: "large" as const, bubbleRadius: "pill" as const, chatTexture: "grid" as const } };
    const first = { ...initial, appearance: { accent: "sky" as const, fontScale: "small" as const, bubbleRadius: "soft" as const, chatTexture: "plain" as const } };
    saveAIProfiles([first, second]);

    expect(getAIProfiles().find(profile => profile.id === first.id)?.appearance?.accent).toBe("sky");
    expect(getAIProfiles().find(profile => profile.id === "second-ai")?.appearance).toMatchObject(second.appearance);
  });

  it("keeps custom chat backgrounds isolated with each AI appearance", () => {
    const initial = getAIProfiles()[0];
    const first = { ...initial, appearance: { accent: "rose" as const, fontScale: "medium" as const, bubbleRadius: "rounded" as const, chatTexture: "dots" as const, backgroundImage: "data:image/jpeg;base64,first-background" } };
    const second = { ...createAIProfile(), id: "second-ai", name: "写作助手", appearance: { accent: "emerald" as const, fontScale: "large" as const, bubbleRadius: "pill" as const, chatTexture: "paper" as const, backgroundImage: "data:image/jpeg;base64,second-background" } };
    saveAIProfiles([first, second]);

    expect(getAIProfiles().find(profile => profile.id === first.id)?.appearance?.backgroundImage).toContain("first-background");
    expect(getAIProfiles().find(profile => profile.id === "second-ai")?.appearance?.backgroundImage).toContain("second-background");
  });

  it("normalizes saved background readability controls for each AI", () => {
    const first = { ...getAIProfiles()[0], appearance: { accent: "sky" as const, fontScale: "medium" as const, bubbleRadius: "rounded" as const, chatTexture: "plain" as const, backgroundImage: "data:image/jpeg;base64,background", backgroundBlur: 99, backgroundOpacity: 0 } };
    saveAIProfiles([first]);
    const restored = getAIProfiles()[0].appearance;

    expect(restored?.backgroundBlur).toBe(16);
    expect(restored?.backgroundOpacity).toBe(0.18);
  });

  it("provides complete built-in themes ready for one-click application", () => {
    expect(BUILTIN_AI_THEMES.map(theme => theme.name)).toEqual(["清透蓝", "暮光紫", "莓果粉", "森林纸", "暖阳黄"]);
    expect(BUILTIN_AI_THEMES.every(theme => theme.appearance.accent && theme.appearance.bubbleRadius && theme.appearance.chatTexture)).toBe(true);
  });

  it("provides editable prompt shortcuts for common chat starts", () => {
    expect(DEFAULT_PROMPT_SHORTCUTS).toHaveLength(6);
    expect(DEFAULT_PROMPT_SHORTCUTS.every(shortcut => shortcut.title && shortcut.prompt.endsWith("\n\n"))).toBe(true);
  });

  it("saves named appearance presets separately from AI profiles", () => {
    const preset = createAppearancePreset("深夜写作", { accent: "violet", fontScale: "large", bubbleRadius: "pill", chatTexture: "paper" });
    const secondPreset = createAppearancePreset("晨间阅读", { accent: "sky", fontScale: "medium", bubbleRadius: "rounded", chatTexture: "plain" });
    saveAppearancePresets([secondPreset, preset]);

    expect(getAppearancePresets().map(item => item.name)).toEqual(["晨间阅读", "深夜写作"]);
    expect(getAIProfiles()[0].appearance?.accent).toBe("sky");
  });

  it("keeps each AI welcome message separate from other profiles", () => {
    const first = { ...getAIProfiles()[0], welcome: "你好，我是学习伙伴。" };
    const second = { ...createAIProfile(), id: "second-ai", name: "写作助手", welcome: "今天想写点什么？" };
    saveAIProfiles([first, second]);

    expect(getAIProfiles().find(profile => profile.id === first.id)?.welcome).toBe("你好，我是学习伙伴。");
    expect(getAIProfiles().find(profile => profile.id === "second-ai")?.welcome).toBe("今天想写点什么？");
  });

  it("keeps conversations isolated by their owning AI profile", () => {
    const one = { ...createConversation("first-ai"), id: "one" };
    const two = { ...createConversation("second-ai"), id: "two" };
    const updated = appendLocalMessages([one, two], "one", [
      { id: "message-one", role: "user", content: "只给第一个 AI 的消息", createdAt: 1 },
    ]);

    expect(conversationsForAI(updated, "first-ai").map(item => item.id)).toEqual(["one"]);
    expect(conversationsForAI(updated, "first-ai")[0].messages[0].content).toBe("只给第一个 AI 的消息");
    expect(conversationsForAI(updated, "second-ai").map(item => item.id)).toEqual(["two"]);
    expect(conversationsForAI(updated, "second-ai")[0].messages).toEqual([]);
  });

  it("persists the user's display name and avatar independently from AI profiles", () => {
    expect(getUserProfile()).toEqual({ name: "我", avatar: "" });
    saveUserProfile({ name: "小林", avatar: "data:image/jpeg;base64,avatar" });

    expect(getUserProfile()).toEqual({ name: "小林", avatar: "data:image/jpeg;base64,avatar" });
  });
});
