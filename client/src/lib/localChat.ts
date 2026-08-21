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

export function saveConversations(conversations: LocalConversation[]) {
  try {
    storage()?.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch {
    // localStorage 配额可能因附件 base64 而被占满，丢弃本次写入，避免阻断对话。
  }
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
