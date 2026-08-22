import type { Attachment } from "./attachments";

export type LocalModelSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  /** 用户消息可携带的附件（图片 / 视频 / 文档等） */
  attachments?: Attachment[];
};

export type LocalConversation = {
  id: string;
  aiProfileId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: LocalMessage[];
};

const SETTINGS_KEY = "qingliao.personal.settings.v1";
const CONVERSATIONS_KEY = "qingliao.personal.conversations.v1";
const DRAFTS_KEY = "qingliao.personal.drafts.v1";

const defaultSettings: LocalModelSettings = { baseUrl: "", apiKey: "", model: "" };

function storage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function parseJson<T>(key: string, fallback: T): T {
  try {
    const value = storage()?.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createConversation(aiProfileId = "default-ai"): LocalConversation {
  const now = Date.now();
  return { id: createId(), aiProfileId, title: "新对话", createdAt: now, updatedAt: now, messages: [] };
}

export function getSettings(): LocalModelSettings {
  const saved = parseJson<Partial<LocalModelSettings>>(SETTINGS_KEY, {});
  return { ...defaultSettings, ...saved };
}

export function saveSettings(settings: LocalModelSettings) {
  storage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getConversations(): LocalConversation[] {
  const conversations = parseJson<LocalConversation[]>(CONVERSATIONS_KEY, []);
  if (!Array.isArray(conversations)) return [];
  return conversations
    .filter(item => item && typeof item.id === "string" && Array.isArray(item.messages))
    .map(item => ({ ...item, aiProfileId: item.aiProfileId || "default-ai" }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function conversationsForAI(conversations: LocalConversation[], aiProfileId: string) {
  return conversations.filter(conversation => conversation.aiProfileId === aiProfileId);
}

export function searchLocalConversations(conversations: LocalConversation[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return conversations;

  return conversations.filter(conversation => {
    const haystack = [
      conversation.title,
      ...conversation.messages.map(message => message.content),
    ].join("\n").toLocaleLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function saveConversations(conversations: LocalConversation[]) {
  try {
    storage()?.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch {
    // localStorage 配额可能因附件 base64 而被占满，丢弃本次写入，避免阻断对话。
  }
}

export function getLocalDraft(key: string) {
  const drafts = parseJson<Record<string, string>>(DRAFTS_KEY, {});
  return typeof drafts[key] === "string" ? drafts[key] : "";
}

export function saveLocalDraft(key: string, value: string) {
  const drafts = parseJson<Record<string, string>>(DRAFTS_KEY, {});
  if (value) {
    drafts[key] = value;
  } else {
    delete drafts[key];
  }
  storage()?.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export function renameLocalConversation(conversations: LocalConversation[], id: string, title: string) {
  const now = Date.now();
  return conversations.map(item => item.id === id ? { ...item, title, updatedAt: now } : item);
}

export function removeLocalConversation(conversations: LocalConversation[], id: string) {
  return conversations.filter(item => item.id !== id);
}

export function appendLocalMessages(conversations: LocalConversation[], id: string, messages: LocalMessage[], title?: string) {
  const now = Date.now();
  return conversations.map(item => item.id === id ? {
    ...item,
    ...(title ? { title } : {}),
    updatedAt: now,
    messages: [...item.messages, ...messages],
  } : item);
}

export function appendAssistantDelta(conversations: LocalConversation[], conversationId: string, messageId: string, delta: string) {
  const now = Date.now();
  return conversations.map(item => item.id === conversationId ? {
    ...item,
    updatedAt: now,
    messages: item.messages.map(message => message.id === messageId ? { ...message, content: message.content + delta } : message),
  } : item);
}

export function dropEmptyAssistantMessage(conversations: LocalConversation[], conversationId: string, messageId: string) {
  return conversations.map(item => item.id === conversationId ? {
    ...item,
    messages: item.messages.filter(message => message.id !== messageId || Boolean(message.content)),
  } : item);
}

export function modelEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

export function modelListEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/$/, "").replace(/\/chat\/completions$/, "");
  return `${normalized}/models`;
}

export type ModelConnectionCheck =
  | { ok: true; endpoint: string }
  | { ok: false; endpoint: string; message: string };

export type AvailableModelList =
  | { ok: true; endpoint: string; models: string[] }
  | { ok: false; endpoint: string; message: string };

function modelListFailure(endpoint: string, status: number) {
  if (status === 401 || status === 403) {
    return { ok: false as const, endpoint, message: "服务已响应，但 API Key 无效或没有访问权限。" };
  }
  if (status === 404) {
    return { ok: false as const, endpoint, message: "服务未提供 /models 检查接口。请确认 Base URL 是否为 OpenAI 兼容地址。" };
  }
  if (status === 429) {
    return { ok: false as const, endpoint, message: "服务已响应，但当前请求受限或额度不足。" };
  }
  return { ok: false as const, endpoint, message: `服务返回 HTTP ${status}，请检查 API 地址或服务状态。` };
}

export async function fetchAvailableModels(
  baseUrl: string,
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<AvailableModelList> {
  const endpoint = modelListEndpoint(baseUrl);
  if (!baseUrl.trim() || !apiKey.trim()) {
    return { ok: false, endpoint, message: "请先填写 API Base URL 和 API Key。" };
  }

  try {
    const response = await request(endpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey.trim()}` },
    });
    if (!response.ok) return modelListFailure(endpoint, response.status);

    const payload = await response.json().catch(() => null) as unknown;
    const candidates = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : payload && typeof payload === "object" && Array.isArray((payload as { models?: unknown }).models)
          ? (payload as { models: unknown[] }).models
          : [];
    const models = Array.from(new Set(candidates.flatMap(item => {
      if (typeof item === "string") return item.trim() ? [item.trim()] : [];
      if (!item || typeof item !== "object") return [];
      const value = (item as { id?: unknown; name?: unknown }).id ?? (item as { name?: unknown }).name;
      return typeof value === "string" && value.trim() ? [value.trim()] : [];
    })));

    if (!models.length) {
      return { ok: false, endpoint, message: "服务已响应，但没有返回可选模型。你仍可手动填写模型名称。" };
    }
    return { ok: true, endpoint, models };
  } catch {
    return { ok: false, endpoint, message: "浏览器无法访问该服务。请检查网络、HTTPS 地址或服务端是否允许跨域（CORS）。" };
  }
}

export async function checkModelConnection(
  baseUrl: string,
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<ModelConnectionCheck> {
  const endpoint = modelListEndpoint(baseUrl);
  if (!baseUrl.trim() || !apiKey.trim()) {
    return { ok: false, endpoint, message: "请先填写 API Base URL 和 API Key。" };
  }

  try {
    const response = await request(endpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey.trim()}` },
    });

    if (response.ok) return { ok: true, endpoint };
    return modelListFailure(endpoint, response.status);
  } catch {
    return { ok: false, endpoint, message: "浏览器无法访问该服务。请检查网络、HTTPS 地址或服务端是否允许跨域（CORS）。" };
  }
}

export function initialTitle(content: string) {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > 32 ? `${text.slice(0, 32)}…` : text || "新对话";
}

export function parseSseEventBlock(block: string) {
  const data = block
    .split(/\r?\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  if (data === "[DONE]") return { delta: "", error: undefined, done: true };

  try {
    const payload = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      error?: { message?: string } | string;
    };
    return {
      delta: payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? "",
      error: typeof payload.error === "string" ? payload.error : payload.error?.message,
      done: false,
    };
  } catch {
    return null;
  }
}
