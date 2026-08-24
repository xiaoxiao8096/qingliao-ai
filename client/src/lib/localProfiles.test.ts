import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendLocalMessages, conversationsForAI, createConversation } from "./localChat";
import {
  BACKGROUND_FILTER_PRESETS,
  BACKGROUND_GRADIENT_PRESETS,
  BACKGROUND_LAYOUT_PRESETS,
  BUILTIN_AI_THEMES,
  DEFAULT_PROMPT_SHORTCUTS,
  createCustomBackgroundFilterPreset,
  createBackgroundPlanExport,
  createBackgroundPlanSharePayload,
  createCustomPromptShortcut,
  createAppearancePreset,
  createAIProfile,
  getActiveAIId,
  getAIProfiles,
  getCustomBackgroundFilterPresets,
  getAppearancePresets,
  getUserProfile,
  getCustomPromptShortcuts,
  parseBackgroundPlanImport,
  parseBackgroundPlanSharePayload,
  saveAppearancePresets,
  saveAIProfiles,
  saveCustomBackgroundFilterPresets,
  saveCustomPromptShortcuts,
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
    const first = { ...getAIProfiles()[0], appearance: { accent: "sky" as const, fontScale: "medium" as const, bubbleRadius: "rounded" as const, chatTexture: "plain" as const, backgroundImage: "data:image/jpeg;base64,background", backgroundBlur: 99, backgroundBrightness: 999, backgroundContrast: 0, backgroundSaturation: 999, backgroundTemperature: -999, backgroundVignette: 999, backgroundGrain: -10, backgroundGradientStart: "invalid", backgroundGradientEnd: "#ABCDEF", backgroundGradientOpacity: 9, backgroundGradientAngle: -10, backgroundOpacity: 0 } };
    saveAIProfiles([first]);
    const restored = getAIProfiles()[0].appearance;

    expect(restored?.backgroundBlur).toBe(16);
    expect(restored?.backgroundBrightness).toBe(140);
    expect(restored?.backgroundContrast).toBe(60);
    expect(restored?.backgroundSaturation).toBe(200);
    expect(restored?.backgroundTemperature).toBe(-100);
    expect(restored?.backgroundVignette).toBe(100);
    expect(restored?.backgroundGrain).toBe(0);
    expect(restored?.backgroundGradientStart).toBe("#4f8fd8");
    expect(restored?.backgroundGradientEnd).toBe("#abcdef");
    expect(restored?.backgroundGradientOpacity).toBe(0.7);
    expect(restored?.backgroundGradientAngle).toBe(0);
    expect(restored?.backgroundOpacity).toBe(0.18);
  });

  it("normalizes saved background scale and position for each AI", () => {
    const first = { ...getAIProfiles()[0], appearance: { accent: "sky" as const, fontScale: "medium" as const, bubbleRadius: "rounded" as const, chatTexture: "plain" as const, backgroundScale: 360, backgroundPositionX: -20, backgroundPositionY: 130 } };
    saveAIProfiles([first]);
    const restored = getAIProfiles()[0].appearance;

    expect(restored?.backgroundScale).toBe(200);
    expect(restored?.backgroundPositionX).toBe(0);
    expect(restored?.backgroundPositionY).toBe(100);
  });

  it("restores centered default background layout when saved layout values are absent", () => {
    const first = { ...getAIProfiles()[0], appearance: { accent: "sky" as const, fontScale: "medium" as const, bubbleRadius: "rounded" as const, chatTexture: "plain" as const } };
    saveAIProfiles([first]);
    const restored = getAIProfiles()[0].appearance;

    expect(restored?.backgroundScale).toBe(100);
    expect(restored?.backgroundPositionX).toBe(50);
    expect(restored?.backgroundPositionY).toBe(50);
  });

  it("provides common background layout presets with usable crop coordinates", () => {
    expect(BACKGROUND_LAYOUT_PRESETS.map(preset => preset.name)).toEqual(["全景", "人像", "左侧", "右侧", "沉浸"]);
    expect(BACKGROUND_LAYOUT_PRESETS[0].layout).toEqual({ backgroundScale: 100, backgroundPositionX: 50, backgroundPositionY: 50 });
    expect(BACKGROUND_LAYOUT_PRESETS.find(preset => preset.id === "portrait")?.layout).toEqual({ backgroundScale: 150, backgroundPositionX: 50, backgroundPositionY: 20 });
    expect(BACKGROUND_LAYOUT_PRESETS.every(preset => preset.layout.backgroundScale >= 100 && preset.layout.backgroundScale <= 200 && preset.layout.backgroundPositionX >= 0 && preset.layout.backgroundPositionX <= 100 && preset.layout.backgroundPositionY >= 0 && preset.layout.backgroundPositionY <= 100)).toBe(true);
  });

  it("provides safe one-click background filter presets", () => {
    expect(BACKGROUND_FILTER_PRESETS.map(preset => preset.name)).toEqual(["原片", "复古", "黑白", "电影感"]);
    expect(BACKGROUND_FILTER_PRESETS.find(preset => preset.id === "mono")?.filter.backgroundSaturation).toBe(0);
    expect(BACKGROUND_FILTER_PRESETS.every(preset => preset.filter.backgroundBrightness >= 60 && preset.filter.backgroundBrightness <= 140 && preset.filter.backgroundContrast >= 60 && preset.filter.backgroundContrast <= 160 && preset.filter.backgroundSaturation >= 0 && preset.filter.backgroundSaturation <= 200 && preset.filter.backgroundTemperature >= -100 && preset.filter.backgroundTemperature <= 100 && preset.filter.backgroundVignette >= 0 && preset.filter.backgroundVignette <= 100 && preset.filter.backgroundGrain >= 0 && preset.filter.backgroundGrain <= 100)).toBe(true);
  });

  it("provides practical one-click background gradient presets", () => {
    expect(BACKGROUND_GRADIENT_PRESETS.map(preset => preset.name)).toEqual(["无叠色", "暮光", "玫瑰", "森林", "暖阳"]);
    expect(BACKGROUND_GRADIENT_PRESETS.every(preset => /^#[0-9a-f]{6}$/i.test(preset.gradient.backgroundGradientStart) && /^#[0-9a-f]{6}$/i.test(preset.gradient.backgroundGradientEnd) && preset.gradient.backgroundGradientOpacity >= 0 && preset.gradient.backgroundGradientOpacity <= 0.7 && preset.gradient.backgroundGradientAngle >= 0 && preset.gradient.backgroundGradientAngle <= 360)).toBe(true);
  });

  it("provides complete built-in themes ready for one-click application", () => {
    expect(BUILTIN_AI_THEMES.map(theme => theme.name)).toEqual(["清透蓝", "暮光紫", "莓果粉", "森林纸", "暖阳黄"]);
    expect(BUILTIN_AI_THEMES.every(theme => theme.appearance.accent && theme.appearance.bubbleRadius && theme.appearance.chatTexture)).toBe(true);
    expect(BUILTIN_AI_THEMES.every(theme => typeof theme.appearance.backgroundVignette === "number" && typeof theme.appearance.backgroundGrain === "number" && typeof theme.appearance.backgroundTemperature === "number")).toBe(true);
    expect(BUILTIN_AI_THEMES.find(theme => theme.id === "violet-night")?.appearance).toMatchObject({ backgroundTemperature: -20, backgroundVignette: 30, backgroundGrain: 15 });
  });

  it("provides editable prompt shortcuts for common chat starts", () => {
    expect(DEFAULT_PROMPT_SHORTCUTS).toHaveLength(6);
    expect(DEFAULT_PROMPT_SHORTCUTS.every(shortcut => shortcut.title && shortcut.prompt.endsWith("\n\n"))).toBe(true);
  });

  it("saves custom prompt shortcuts separately from AI profiles", () => {
    const shortcut = createCustomPromptShortcut("周报整理", "请帮我整理本周工作周报：\n\n");
    saveCustomPromptShortcuts([shortcut]);

    expect(getCustomPromptShortcuts()).toMatchObject([{ id: shortcut.id, title: "周报整理", prompt: "请帮我整理本周工作周报：" }]);
    expect(getAIProfiles()[0].name).toBe("我的 AI");
  });

  it("saves reusable custom background filter presets separately from AI profiles", () => {
    const appearance = { accent: "violet" as const, fontScale: "medium" as const, bubbleRadius: "rounded" as const, chatTexture: "grid" as const, backgroundBlur: 99, backgroundBrightness: 999, backgroundContrast: 0, backgroundSaturation: 160, backgroundTemperature: -40, backgroundVignette: 45, backgroundGrain: 18, backgroundGradientStart: "#987654", backgroundGradientEnd: "#abcdef", backgroundGradientOpacity: 0.25, backgroundGradientAngle: 225 };
    const preset = createCustomBackgroundFilterPreset("夜读氛围", appearance, "阅读", "#7c3aed");
    saveCustomBackgroundFilterPresets([preset]);

    expect(getCustomBackgroundFilterPresets()).toMatchObject([{ id: preset.id, name: "夜读氛围", category: "阅读", categoryColor: "#7c3aed", filter: { backgroundBlur: 16, backgroundBrightness: 140, backgroundContrast: 60, backgroundSaturation: 160, backgroundTemperature: -40, backgroundVignette: 45, backgroundGrain: 18, backgroundGradientStart: "#987654", backgroundGradientEnd: "#abcdef", backgroundGradientOpacity: 0.25, backgroundGradientAngle: 225 } }]);
    expect(getAIProfiles()[0].appearance?.backgroundBrightness).toBe(100);
  });

  it("preserves custom background filter preset order and renamed labels", () => {
    const first = createCustomBackgroundFilterPreset("第一组", { accent: "sky", fontScale: "medium", bubbleRadius: "rounded", chatTexture: "plain" });
    const second = createCustomBackgroundFilterPreset("第二组", { accent: "rose", fontScale: "large", bubbleRadius: "pill", chatTexture: "dots" });
    saveCustomBackgroundFilterPresets([{ ...second, name: "夜间阅读", category: "夜读", updatedAt: second.updatedAt + 1 }, first]);

    expect(getCustomBackgroundFilterPresets().map(preset => preset.name)).toEqual(["夜间阅读", "第一组"]);
    expect(getCustomBackgroundFilterPresets()[0].category).toBe("夜读");
  });

  it("exports and imports a safe background plan without image or private profile data", () => {
    const appearance = { accent: "violet" as const, fontScale: "medium" as const, bubbleRadius: "rounded" as const, chatTexture: "grid" as const, backgroundImage: "data:image/jpeg;base64,secret-image", backgroundBlur: 4, backgroundBrightness: 95, backgroundContrast: 120, backgroundSaturation: 80, backgroundTemperature: -20, backgroundVignette: 35, backgroundGrain: 18, backgroundGradientStart: "#312e81", backgroundGradientEnd: "#8b5cf6", backgroundGradientOpacity: 0.28, backgroundGradientAngle: 145, backgroundOpacity: 0.62, backgroundScale: 160, backgroundPositionX: 35, backgroundPositionY: 20 };
    const preset = createCustomBackgroundFilterPreset("夜读", appearance, "专注");
    const exported = createBackgroundPlanExport(appearance, [preset]);
    const imported = parseBackgroundPlanImport(exported);

    expect(JSON.stringify(exported)).not.toContain("secret-image");
    expect(imported.background).toMatchObject({ backgroundBlur: 4, backgroundGradientStart: "#312e81", backgroundScale: 160, backgroundPositionY: 20 });
    expect(imported.customFilterPresets[0]).toMatchObject({ name: "夜读", category: "专注" });
    expect(imported.customFilterPresets[0].id).not.toBe(preset.id);
    expect(() => parseBackgroundPlanImport({ format: "other-plan", version: 1 })).toThrow("不是轻聊 AI 的背景方案文件");
  });

  it("creates a compact safe QR share payload for the current background only", () => {
    const appearance = { accent: "rose" as const, fontScale: "large" as const, bubbleRadius: "pill" as const, chatTexture: "paper" as const, backgroundImage: "data:image/png;base64,private-image", backgroundBlur: 5, backgroundBrightness: 90, backgroundContrast: 120, backgroundSaturation: 85, backgroundTemperature: 20, backgroundVignette: 30, backgroundGrain: 15, backgroundGradientStart: "#ec4899", backgroundGradientEnd: "#312e81", backgroundGradientOpacity: 0.25, backgroundGradientAngle: 210, backgroundOpacity: 0.6, backgroundScale: 155, backgroundPositionX: 40, backgroundPositionY: 25 };
    const payload = createBackgroundPlanSharePayload(appearance);
    const restored = parseBackgroundPlanSharePayload(payload);

    expect(payload).not.toContain("private-image");
    expect(payload).not.toContain("accent");
    expect(restored.background).toMatchObject({ backgroundBlur: 5, backgroundGradientEnd: "#312e81", backgroundScale: 155, backgroundPositionY: 25 });
    expect(restored.customFilterPresets).toEqual([]);
    expect(() => parseBackgroundPlanSharePayload('{"v":1,"b":[]}')).toThrow("版本不受支持");
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
