import { getSettings, type LocalModelSettings } from "./localChat";

export type AIAppearance = {
  accent: "sky" | "violet" | "rose" | "emerald" | "amber";
  fontScale: "small" | "medium" | "large";
  bubbleRadius: "soft" | "rounded" | "pill";
  chatTexture: "plain" | "dots" | "grid" | "paper";
  /** 当前 AI 的本机聊天背景，使用压缩后的 data URL 保存。 */
  backgroundImage?: string;
  /** 背景图片的模糊程度（px），用于提升文字可读性。 */
  backgroundBlur?: number;
  /** 背景图片的亮度、对比度和饱和度（百分比）。 */
  backgroundBrightness?: number;
  backgroundContrast?: number;
  backgroundSaturation?: number;
  /** 背景色温（-100 为冷调，100 为暖调）。 */
  backgroundTemperature?: number;
  /** 背景暗角与颗粒强度（百分比）。 */
  backgroundVignette?: number;
  backgroundGrain?: number;
  /** 背景渐变叠色层，透明度为 0 时不显示。 */
  backgroundGradientStart?: string;
  backgroundGradientEnd?: string;
  backgroundGradientOpacity?: number;
  backgroundGradientAngle?: number;
  /** 背景上的浅色保护层透明度（0-1），数值越大文字越清晰。 */
  backgroundOpacity?: number;
  /** 背景图片的缩放比例（百分比）。 */
  backgroundScale?: number;
  /** 背景图片的水平与垂直定位（百分比）。 */
  backgroundPositionX?: number;
  backgroundPositionY?: number;
};

export type AppearancePreset = {
  id: string;
  name: string;
  appearance: AIAppearance;
  createdAt: number;
};

export type BackgroundFilter = {
  backgroundBlur: number;
  backgroundBrightness: number;
  backgroundContrast: number;
  backgroundSaturation: number;
  backgroundTemperature: number;
  backgroundVignette: number;
  backgroundGrain: number;
  backgroundGradientStart: string;
  backgroundGradientEnd: string;
  backgroundGradientOpacity: number;
  backgroundGradientAngle: number;
};

export type CustomBackgroundFilterPreset = {
  id: string;
  name: string;
  category: string;
  filter: BackgroundFilter;
  createdAt: number;
  updatedAt: number;
};

export type BackgroundPlanExport = {
  format: "qingliao-background-plan";
  version: 1;
  exportedAt: number;
  background: Pick<AIAppearance, "backgroundBlur" | "backgroundBrightness" | "backgroundContrast" | "backgroundSaturation" | "backgroundTemperature" | "backgroundVignette" | "backgroundGrain" | "backgroundGradientStart" | "backgroundGradientEnd" | "backgroundGradientOpacity" | "backgroundGradientAngle" | "backgroundOpacity" | "backgroundScale" | "backgroundPositionX" | "backgroundPositionY">;
  customFilterPresets: CustomBackgroundFilterPreset[];
};

export type CustomPromptShortcut = {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
};

export const DEFAULT_AI_APPEARANCE: AIAppearance = {
  accent: "sky", fontScale: "medium", bubbleRadius: "rounded", chatTexture: "plain", backgroundBlur: 0, backgroundBrightness: 100, backgroundContrast: 100, backgroundSaturation: 100, backgroundTemperature: 0, backgroundVignette: 0, backgroundGrain: 0, backgroundGradientStart: "#4f8fd8", backgroundGradientEnd: "#8b5cf6", backgroundGradientOpacity: 0, backgroundGradientAngle: 135, backgroundOpacity: 0.72, backgroundScale: 100, backgroundPositionX: 50, backgroundPositionY: 50,
};

/** 内置背景排版方案；应用后仍可通过裁切框和滑块微调。 */
export const BACKGROUND_LAYOUT_PRESETS = [
  { id: "full", name: "全景", note: "完整居中", layout: { backgroundScale: 100, backgroundPositionX: 50, backgroundPositionY: 50 } },
  { id: "portrait", name: "人像", note: "上方聚焦", layout: { backgroundScale: 150, backgroundPositionX: 50, backgroundPositionY: 20 } },
  { id: "left", name: "左侧", note: "左侧主体", layout: { backgroundScale: 150, backgroundPositionX: 0, backgroundPositionY: 50 } },
  { id: "right", name: "右侧", note: "右侧主体", layout: { backgroundScale: 150, backgroundPositionX: 100, backgroundPositionY: 50 } },
  { id: "immersive", name: "沉浸", note: "放大居中", layout: { backgroundScale: 185, backgroundPositionX: 50, backgroundPositionY: 50 } },
] as const;

/** 内置背景滤镜方案；应用后仍可通过滑块进行细微调整。 */
export const BACKGROUND_FILTER_PRESETS = [
  { id: "natural", name: "原片", note: "自然真实", filter: { backgroundBlur: 0, backgroundBrightness: 100, backgroundContrast: 100, backgroundSaturation: 100, backgroundTemperature: 0, backgroundVignette: 0, backgroundGrain: 0, backgroundGradientStart: "#4f8fd8", backgroundGradientEnd: "#8b5cf6", backgroundGradientOpacity: 0, backgroundGradientAngle: 135 } },
  { id: "vintage", name: "复古", note: "暖调柔和", filter: { backgroundBlur: 1, backgroundBrightness: 105, backgroundContrast: 85, backgroundSaturation: 75, backgroundTemperature: 45, backgroundVignette: 20, backgroundGrain: 22, backgroundGradientStart: "#c08457", backgroundGradientEnd: "#5c4033", backgroundGradientOpacity: 0.18, backgroundGradientAngle: 135 } },
  { id: "mono", name: "黑白", note: "高对比", filter: { backgroundBlur: 0, backgroundBrightness: 105, backgroundContrast: 125, backgroundSaturation: 0, backgroundTemperature: 0, backgroundVignette: 18, backgroundGrain: 8, backgroundGradientStart: "#64748b", backgroundGradientEnd: "#0f172a", backgroundGradientOpacity: 0.1, backgroundGradientAngle: 135 } },
  { id: "cinematic", name: "电影感", note: "冷调质感", filter: { backgroundBlur: 0, backgroundBrightness: 90, backgroundContrast: 125, backgroundSaturation: 78, backgroundTemperature: -35, backgroundVignette: 35, backgroundGrain: 16, backgroundGradientStart: "#0f4c5c", backgroundGradientEnd: "#1e293b", backgroundGradientOpacity: 0.24, backgroundGradientAngle: 145 } },
] as const;

/** 常用渐变叠色组合；应用后仍可通过颜色和滑块继续微调。 */
export const BACKGROUND_GRADIENT_PRESETS = [
  { id: "none", name: "无叠色", note: "保留原图", gradient: { backgroundGradientStart: "#4f8fd8", backgroundGradientEnd: "#8b5cf6", backgroundGradientOpacity: 0, backgroundGradientAngle: 135 } },
  { id: "twilight", name: "暮光", note: "紫蓝沉静", gradient: { backgroundGradientStart: "#312e81", backgroundGradientEnd: "#8b5cf6", backgroundGradientOpacity: 0.28, backgroundGradientAngle: 145 } },
  { id: "rose", name: "玫瑰", note: "温柔层次", gradient: { backgroundGradientStart: "#ec4899", backgroundGradientEnd: "#7c3aed", backgroundGradientOpacity: 0.25, backgroundGradientAngle: 210 } },
  { id: "forest", name: "森林", note: "自然耐读", gradient: { backgroundGradientStart: "#047857", backgroundGradientEnd: "#0f766e", backgroundGradientOpacity: 0.24, backgroundGradientAngle: 135 } },
  { id: "sunset", name: "暖阳", note: "明亮温暖", gradient: { backgroundGradientStart: "#f97316", backgroundGradientEnd: "#ec4899", backgroundGradientOpacity: 0.22, backgroundGradientAngle: 125 } },
] as const;

/** 用半透明冷暖色层模拟色温，保留照片细节与对比关系。 */
export function backgroundTemperatureOverlay(temperature = 0) {
  const strength = Math.min(0.42, Math.abs(temperature) / 240);
  if (strength === 0) return "rgb(0 0 0 / 0)";
  return temperature > 0 ? `rgb(255 154 82 / ${strength})` : `rgb(71 156 255 / ${strength})`;
}

/** 将暗角作为单独图层，避免影响聊天文字清晰度。 */
export function backgroundVignetteOverlay(vignette = 0) {
  const strength = Math.min(0.72, Math.max(0, vignette) / 115);
  return `radial-gradient(ellipse at center, rgb(15 23 42 / 0) 35%, rgb(15 23 42 / ${strength}) 100%)`;
}

function hexToRgba(color: string, opacity: number) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000";
  const red = Number.parseInt(valid.slice(1, 3), 16);
  const green = Number.parseInt(valid.slice(3, 5), 16);
  const blue = Number.parseInt(valid.slice(5, 7), 16);
  return `rgb(${red} ${green} ${blue} / ${Math.min(0.7, Math.max(0, opacity))})`;
}

/** 将渐变作为独立背景图层，避免改变聊天文字与气泡的对比度。 */
export function backgroundGradientOverlay(start = "#4f8fd8", end = "#8b5cf6", opacity = 0, angle = 135) {
  return `linear-gradient(${Math.min(360, Math.max(0, angle))}deg, ${hexToRgba(start, opacity)}, ${hexToRgba(end, opacity)})`;
}

/** 内联噪点纹理，无需额外网络请求或本地图片文件。 */
export const BACKGROUND_GRAIN_TEXTURE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.78' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.82'/%3E%3C/svg%3E\")";

export const BUILTIN_AI_THEMES = [
  { id: "clear-sky", name: "清透蓝", note: "轻盈、清爽", appearance: { accent: "sky", fontScale: "medium", bubbleRadius: "rounded", chatTexture: "plain", backgroundBlur: 0, backgroundBrightness: 105, backgroundContrast: 90, backgroundSaturation: 110, backgroundTemperature: -10, backgroundVignette: 0, backgroundGrain: 0 } },
  { id: "violet-night", name: "暮光紫", note: "专注、沉静", appearance: { accent: "violet", fontScale: "medium", bubbleRadius: "pill", chatTexture: "grid", backgroundBlur: 0, backgroundBrightness: 90, backgroundContrast: 120, backgroundSaturation: 80, backgroundTemperature: -20, backgroundVignette: 30, backgroundGrain: 15 } },
  { id: "berry-note", name: "莓果粉", note: "柔和、亲近", appearance: { accent: "rose", fontScale: "large", bubbleRadius: "rounded", chatTexture: "dots", backgroundBlur: 1, backgroundBrightness: 110, backgroundContrast: 90, backgroundSaturation: 110, backgroundTemperature: 25, backgroundVignette: 10, backgroundGrain: 10 } },
  { id: "forest-paper", name: "森林纸", note: "自然、耐读", appearance: { accent: "emerald", fontScale: "medium", bubbleRadius: "soft", chatTexture: "paper", backgroundBlur: 0, backgroundBrightness: 90, backgroundContrast: 110, backgroundSaturation: 80, backgroundTemperature: 15, backgroundVignette: 25, backgroundGrain: 20 } },
  { id: "warm-amber", name: "暖阳黄", note: "明亮、有温度", appearance: { accent: "amber", fontScale: "large", bubbleRadius: "pill", chatTexture: "plain", backgroundBlur: 0, backgroundBrightness: 110, backgroundContrast: 95, backgroundSaturation: 110, backgroundTemperature: 40, backgroundVignette: 10, backgroundGrain: 10 } },
] as const satisfies ReadonlyArray<{ id: string; name: string; note: string; appearance: AIAppearance }>;

export const DEFAULT_PROMPT_SHORTCUTS = [
  { id: "summarize", title: "快速总结", prompt: "请帮我把下面内容提炼成清晰的要点和结论：\n\n" },
  { id: "polish", title: "润色表达", prompt: "请帮我润色下面这段文字，使表达自然、清楚且保留原意：\n\n" },
  { id: "plan", title: "制定计划", prompt: "请帮我为下面的目标制定一份可执行的分步计划：\n\n" },
  { id: "brainstorm", title: "头脑风暴", prompt: "围绕下面的主题，给我提供一些有创意、可落地的思路：\n\n" },
  { id: "explain", title: "解释概念", prompt: "请用通俗易懂的方式解释下面的概念，并举一个例子：\n\n" },
  { id: "translate", title: "翻译改写", prompt: "请将下面内容翻译并改写得自然流畅：\n\n" },
] as const;

export type LocalAIProfile = LocalModelSettings & {
  id: string;
  name: string;
  avatar: string;
  /** 该 AI 的人物设定 / 系统提示词（可选） */
  persona: string;
  /** 该 AI 在新会话空状态展示的专属欢迎语（可选） */
  welcome: string;
  /** 该 AI 专属外观；旧档案缺省时沿用默认值 */
  appearance?: AIAppearance;
  createdAt: number;
  updatedAt: number;
};

export type LocalUserProfile = {
  name: string;
  avatar: string;
};

const AI_PROFILES_KEY = "qingliao.personal.ai-profiles.v1";
const ACTIVE_AI_KEY = "qingliao.personal.active-ai.v1";
const USER_PROFILE_KEY = "qingliao.personal.user-profile.v1";
const APPEARANCE_PRESETS_KEY = "qingliao.personal.appearance-presets.v1";
const CUSTOM_PROMPT_SHORTCUTS_KEY = "qingliao.personal.prompt-shortcuts.v1";
const CUSTOM_BACKGROUND_FILTER_PRESETS_KEY = "qingliao.personal.background-filter-presets.v1";
export const DEFAULT_AI_ID = "default-ai";

function storage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function parse<T>(key: string, fallback: T): T {
  try {
    const value = storage()?.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function defaultAI(): LocalAIProfile {
  const old = getSettings();
  const now = Date.now();
  return {
    id: DEFAULT_AI_ID,
    name: "我的 AI",
    avatar: "",
    baseUrl: old.baseUrl,
    apiKey: old.apiKey,
    model: old.model,
    persona: "",
    welcome: "",
    appearance: DEFAULT_AI_APPEARANCE,
    createdAt: now,
    updatedAt: now,
  };
}

export function createProfileId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizedAppearance(value?: Partial<AIAppearance>): AIAppearance {
  const appearance = { ...DEFAULT_AI_APPEARANCE, ...value };
  const blur = Number(value?.backgroundBlur);
  const brightness = Number(value?.backgroundBrightness);
  const contrast = Number(value?.backgroundContrast);
  const saturation = Number(value?.backgroundSaturation);
  const temperature = Number(value?.backgroundTemperature);
  const vignette = Number(value?.backgroundVignette);
  const grain = Number(value?.backgroundGrain);
  const gradientOpacity = Number(value?.backgroundGradientOpacity);
  const gradientAngle = Number(value?.backgroundGradientAngle);
  const opacity = Number(value?.backgroundOpacity);
  const scale = Number(value?.backgroundScale);
  const positionX = Number(value?.backgroundPositionX);
  const positionY = Number(value?.backgroundPositionY);
  return {
    ...appearance,
    backgroundBlur: Number.isFinite(blur) ? Math.min(16, Math.max(0, blur)) : 0,
    backgroundBrightness: Number.isFinite(brightness) ? Math.min(140, Math.max(60, brightness)) : 100,
    backgroundContrast: Number.isFinite(contrast) ? Math.min(160, Math.max(60, contrast)) : 100,
    backgroundSaturation: Number.isFinite(saturation) ? Math.min(200, Math.max(0, saturation)) : 100,
    backgroundTemperature: Number.isFinite(temperature) ? Math.min(100, Math.max(-100, temperature)) : 0,
    backgroundVignette: Number.isFinite(vignette) ? Math.min(100, Math.max(0, vignette)) : 0,
    backgroundGrain: Number.isFinite(grain) ? Math.min(100, Math.max(0, grain)) : 0,
    backgroundGradientStart: typeof value?.backgroundGradientStart === "string" && /^#[0-9a-fA-F]{6}$/.test(value.backgroundGradientStart) ? value.backgroundGradientStart.toLowerCase() : "#4f8fd8",
    backgroundGradientEnd: typeof value?.backgroundGradientEnd === "string" && /^#[0-9a-fA-F]{6}$/.test(value.backgroundGradientEnd) ? value.backgroundGradientEnd.toLowerCase() : "#8b5cf6",
    backgroundGradientOpacity: Number.isFinite(gradientOpacity) ? Math.min(0.7, Math.max(0, gradientOpacity)) : 0,
    backgroundGradientAngle: Number.isFinite(gradientAngle) ? Math.min(360, Math.max(0, gradientAngle)) : 135,
    backgroundOpacity: Number.isFinite(opacity) ? Math.min(0.92, Math.max(0.18, opacity)) : 0.72,
    backgroundScale: Number.isFinite(scale) ? Math.min(200, Math.max(100, scale)) : 100,
    backgroundPositionX: Number.isFinite(positionX) ? Math.min(100, Math.max(0, positionX)) : 50,
    backgroundPositionY: Number.isFinite(positionY) ? Math.min(100, Math.max(0, positionY)) : 50,
  };
}

export function normalizedBackgroundFilter(value?: Partial<AIAppearance>): BackgroundFilter {
  const appearance = normalizedAppearance(value);
  return {
    backgroundBlur: appearance.backgroundBlur ?? 0,
    backgroundBrightness: appearance.backgroundBrightness ?? 100,
    backgroundContrast: appearance.backgroundContrast ?? 100,
    backgroundSaturation: appearance.backgroundSaturation ?? 100,
    backgroundTemperature: appearance.backgroundTemperature ?? 0,
    backgroundVignette: appearance.backgroundVignette ?? 0,
    backgroundGrain: appearance.backgroundGrain ?? 0,
    backgroundGradientStart: appearance.backgroundGradientStart ?? "#4f8fd8",
    backgroundGradientEnd: appearance.backgroundGradientEnd ?? "#8b5cf6",
    backgroundGradientOpacity: appearance.backgroundGradientOpacity ?? 0,
    backgroundGradientAngle: appearance.backgroundGradientAngle ?? 135,
  };
}

function normalizedFilterCategory(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 16) : "未分类";
}

function normalizedPromptShortcut(value: Partial<CustomPromptShortcut>): CustomPromptShortcut | null {
  const title = value.title?.trim().slice(0, 24) ?? "";
  const prompt = value.prompt?.trim().slice(0, 600) ?? "";
  if (!title || !prompt || !value.id) return null;
  const now = Date.now();
  return { id: value.id, title, prompt, createdAt: Number(value.createdAt) || now, updatedAt: Number(value.updatedAt) || now };
}

export function getCustomPromptShortcuts(): CustomPromptShortcut[] {
  const saved = parse<CustomPromptShortcut[]>(CUSTOM_PROMPT_SHORTCUTS_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.map(normalizedPromptShortcut).filter((item): item is CustomPromptShortcut => Boolean(item)).slice(0, 12);
}

export function saveCustomPromptShortcuts(shortcuts: CustomPromptShortcut[]) {
  storage()?.setItem(CUSTOM_PROMPT_SHORTCUTS_KEY, JSON.stringify(shortcuts.slice(0, 12)));
}

export function createCustomPromptShortcut(title: string, prompt: string): CustomPromptShortcut {
  const now = Date.now();
  return { id: createProfileId(), title: title.trim().slice(0, 24), prompt: prompt.trim().slice(0, 600), createdAt: now, updatedAt: now };
}

export function getCustomBackgroundFilterPresets(): CustomBackgroundFilterPreset[] {
  const saved = parse<CustomBackgroundFilterPreset[]>(CUSTOM_BACKGROUND_FILTER_PRESETS_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(preset => preset && typeof preset.id === "string" && typeof preset.name === "string" && preset.name.trim() && preset.filter)
    .slice(0, 12)
    .map(preset => ({ id: preset.id, name: preset.name.trim().slice(0, 20), category: normalizedFilterCategory(preset.category), filter: normalizedBackgroundFilter(preset.filter), createdAt: Number(preset.createdAt) || Date.now(), updatedAt: Number(preset.updatedAt) || Number(preset.createdAt) || Date.now() }));
}

export function saveCustomBackgroundFilterPresets(presets: CustomBackgroundFilterPreset[]) {
  storage()?.setItem(CUSTOM_BACKGROUND_FILTER_PRESETS_KEY, JSON.stringify(presets.slice(0, 12)));
}

export function createCustomBackgroundFilterPreset(name: string, appearance: AIAppearance, category = "未分类"): CustomBackgroundFilterPreset {
  const now = Date.now();
  return { id: createProfileId(), name: name.trim().slice(0, 20), category: normalizedFilterCategory(category), filter: normalizedBackgroundFilter(appearance), createdAt: now, updatedAt: now };
}

function backgroundPlanAppearance(value?: Partial<AIAppearance>): BackgroundPlanExport["background"] {
  const appearance = normalizedAppearance(value);
  return {
    backgroundBlur: appearance.backgroundBlur,
    backgroundBrightness: appearance.backgroundBrightness,
    backgroundContrast: appearance.backgroundContrast,
    backgroundSaturation: appearance.backgroundSaturation,
    backgroundTemperature: appearance.backgroundTemperature,
    backgroundVignette: appearance.backgroundVignette,
    backgroundGrain: appearance.backgroundGrain,
    backgroundGradientStart: appearance.backgroundGradientStart,
    backgroundGradientEnd: appearance.backgroundGradientEnd,
    backgroundGradientOpacity: appearance.backgroundGradientOpacity,
    backgroundGradientAngle: appearance.backgroundGradientAngle,
    backgroundOpacity: appearance.backgroundOpacity,
    backgroundScale: appearance.backgroundScale,
    backgroundPositionX: appearance.backgroundPositionX,
    backgroundPositionY: appearance.backgroundPositionY,
  };
}

/** 导出不含背景图片、API Key、聊天记录或个人资料的纯背景方案 JSON。 */
export function createBackgroundPlanExport(appearance: AIAppearance, customFilterPresets: CustomBackgroundFilterPreset[]): BackgroundPlanExport {
  return {
    format: "qingliao-background-plan",
    version: 1,
    exportedAt: Date.now(),
    background: backgroundPlanAppearance(appearance),
    customFilterPresets: customFilterPresets.slice(0, 12).map(preset => ({ ...preset, category: normalizedFilterCategory(preset.category), filter: normalizedBackgroundFilter(preset.filter) })),
  };
}

/** 读取并校验导入方案；只接受背景显示参数和滤镜组合，拒绝任何其他敏感数据。 */
export function parseBackgroundPlanImport(value: unknown): BackgroundPlanExport {
  if (!value || typeof value !== "object") throw new Error("方案文件格式不正确。");
  const raw = value as Partial<BackgroundPlanExport>;
  if (raw.format !== "qingliao-background-plan" || raw.version !== 1) throw new Error("这不是轻聊 AI 的背景方案文件，或版本不受支持。");
  const presets = Array.isArray(raw.customFilterPresets) ? raw.customFilterPresets : [];
  const now = Date.now();
  return {
    format: "qingliao-background-plan",
    version: 1,
    exportedAt: Number(raw.exportedAt) || now,
    background: backgroundPlanAppearance(raw.background),
    customFilterPresets: presets
      .filter(preset => preset && typeof preset.id === "string" && typeof preset.name === "string" && preset.name.trim() && preset.filter)
      .slice(0, 12)
      .map(preset => ({ id: createProfileId(), name: preset.name.trim().slice(0, 20), category: normalizedFilterCategory(preset.category), filter: normalizedBackgroundFilter(preset.filter), createdAt: now, updatedAt: now })),
  };
}

export function getAppearancePresets(): AppearancePreset[] {
  const saved = parse<AppearancePreset[]>(APPEARANCE_PRESETS_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(preset => preset && typeof preset.id === "string" && typeof preset.name === "string" && preset.name.trim())
    .slice(0, 20)
    .map(preset => ({ ...preset, name: preset.name.trim().slice(0, 24), appearance: normalizedAppearance(preset.appearance) }));
}

export function saveAppearancePresets(presets: AppearancePreset[]) {
  storage()?.setItem(APPEARANCE_PRESETS_KEY, JSON.stringify(presets.slice(0, 20)));
}

export function createAppearancePreset(name: string, appearance: AIAppearance): AppearancePreset {
  return { id: createProfileId(), name: name.trim().slice(0, 24), appearance: normalizedAppearance(appearance), createdAt: Date.now() };
}

export function getAIProfiles(): LocalAIProfile[] {
  const saved = parse<LocalAIProfile[]>(AI_PROFILES_KEY, []);
  if (Array.isArray(saved) && saved.length > 0) {
    return saved
      .filter(profile => profile && typeof profile.id === "string" && typeof profile.name === "string")
      .map(profile => ({ ...profile, appearance: normalizedAppearance(profile.appearance) }));
  }
  const initial = defaultAI();
  saveAIProfiles([initial]);
  return [initial];
}

export function saveAIProfiles(profiles: LocalAIProfile[]) {
  storage()?.setItem(AI_PROFILES_KEY, JSON.stringify(profiles));
}

export function getActiveAIId() {
  return storage()?.getItem(ACTIVE_AI_KEY) || getAIProfiles()[0]?.id || DEFAULT_AI_ID;
}

export function setActiveAIId(id: string) {
  storage()?.setItem(ACTIVE_AI_KEY, id);
}

export function createAIProfile(): LocalAIProfile {
  const now = Date.now();
  return {
    id: createProfileId(),
    name: "新的 AI",
    avatar: "",
    baseUrl: "",
    apiKey: "",
    model: "",
    persona: "",
    welcome: "",
    appearance: DEFAULT_AI_APPEARANCE,
    createdAt: now,
    updatedAt: now,
  };
}

export function getUserProfile(): LocalUserProfile {
  const saved = parse<Partial<LocalUserProfile>>(USER_PROFILE_KEY, {});
  return { name: saved.name?.trim() || "我", avatar: saved.avatar || "" };
}

export function saveUserProfile(profile: LocalUserProfile) {
  storage()?.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type)) {
    throw new Error("请选择 PNG、JPG 或 WebP 图片。");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("头像图片不能超过 5MB。");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("图片读取失败，请换一张图片。"));
      node.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持头像处理。");
    const scale = Math.max(size / image.width, size / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function backgroundImageFileToDataUrl(file: File): Promise<string> {
  if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type)) {
    throw new Error("请选择 PNG、JPG 或 WebP 图片作为背景。");
  }
  if (file.size > 4 * 1024 * 1024) {
    throw new Error("背景图片不能超过 4MB。");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("背景图片读取失败，请换一张图片。"));
      node.src = objectUrl;
    });
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持背景图片处理。");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.76);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
