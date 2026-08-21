import { getSettings, type LocalModelSettings } from "./localChat";

export type LocalAIProfile = LocalModelSettings & {
  id: string;
  name: string;
  avatar: string;
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
    createdAt: now,
    updatedAt: now,
  };
}

export function createProfileId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
