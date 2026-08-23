import { getSettings, type LocalModelSettings } from "./localChat";

export type AIAppearance = {
  accent: "sky" | "violet" | "rose" | "emerald" | "amber";
  fontScale: "small" | "medium" | "large";
  bubbleRadius: "soft" | "rounded" | "pill";
  chatTexture: "plain" | "dots" | "grid" | "paper";
  /** 当前 AI 的本机聊天背景，使用压缩后的 data URL 保存。 */
  backgroundImage?: string;
};

export type AppearancePreset = {
  id: string;
  name: string;
  appearance: AIAppearance;
  createdAt: number;
};

export const DEFAULT_AI_APPEARANCE: AIAppearance = {
  accent: "sky", fontScale: "medium", bubbleRadius: "rounded", chatTexture: "plain",
};

export const BUILTIN_AI_THEMES = [
  { id: "clear-sky", name: "清透蓝", note: "轻盈、清爽", appearance: { accent: "sky", fontScale: "medium", bubbleRadius: "rounded", chatTexture: "plain" } },
  { id: "violet-night", name: "暮光紫", note: "专注、沉静", appearance: { accent: "violet", fontScale: "medium", bubbleRadius: "pill", chatTexture: "grid" } },
  { id: "berry-note", name: "莓果粉", note: "柔和、亲近", appearance: { accent: "rose", fontScale: "large", bubbleRadius: "rounded", chatTexture: "dots" } },
  { id: "forest-paper", name: "森林纸", note: "自然、耐读", appearance: { accent: "emerald", fontScale: "medium", bubbleRadius: "soft", chatTexture: "paper" } },
  { id: "warm-amber", name: "暖阳黄", note: "明亮、有温度", appearance: { accent: "amber", fontScale: "large", bubbleRadius: "pill", chatTexture: "plain" } },
] as const satisfies ReadonlyArray<{ id: string; name: string; note: string; appearance: AIAppearance }>;

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
  return { ...DEFAULT_AI_APPEARANCE, ...value };
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
    return saved.filter(profile => profile && typeof profile.id === "string" && typeof profile.name === "string");
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
