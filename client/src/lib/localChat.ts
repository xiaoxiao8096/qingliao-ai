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
  /** 用户对助手消息的反馈（仅本地记录，不上传） */
  feedback?: "up" | "down";
};

export type LocalConversation = {
  id: string;
  aiProfileId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: LocalMessage[];
  pinned?: boolean;
  group?: string;
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
  return orderLocalConversations(conversations.filter(conversation => conversation.aiProfileId === aiProfileId));
}

export function orderLocalConversations(conversations: LocalConversation[]) {
  return [...conversations].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt);
}

export function toggleLocalConversationPin(conversations: LocalConversation[], id: string) {
  return conversations.map(item => item.id === id ? { ...item, pinned: !item.pinned, updatedAt: Date.now() } : item);
}

export function setLocalConversationGroup(conversations: LocalConversation[], id: string, group: string) {
  const normalized = group.trim().slice(0, 32);
  return conversations.map(item => item.id === id ? { ...item, group: normalized || undefined, updatedAt: Date.now() } : item);
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

/** 仅保留到 messageId（含）为止的消息，删除其后的全部内容。用于「重新生成 / 编辑后重发」。 */
export function truncateAfter(conversations: LocalConversation[], conversationId: string, messageId: string) {
  return conversations.map(item => {
    if (item.id !== conversationId) return item;
    const index = item.messages.findIndex(message => message.id === messageId);
    if (index === -1) return item;
    return { ...item, messages: item.messages.slice(0, index + 1), updatedAt: Date.now() };
  });
}

/** 修改某条消息的正文与附件（用于编辑用户消息）。 */
export function updateMessageContent(
  conversations: LocalConversation[],
  conversationId: string,
  messageId: string,
  content: string,
  attachments?: Attachment[],
) {
  return conversations.map(item => {
    if (item.id !== conversationId) return item;
    return {
      ...item,
      updatedAt: Date.now(),
      messages: item.messages.map(message =>
        message.id === messageId ? { ...message, content, ...(attachments ? { attachments } : {}) } : message,
      ),
    };
  });
}

/** 删除某条消息及其之后的全部内容（保持对话结构合法）。 */
export function removeMessageAndAfter(conversations: LocalConversation[], conversationId: string, messageId: string) {
  return conversations.map(item => {
    if (item.id !== conversationId) return item;
    const index = item.messages.findIndex(message => message.id === messageId);
    if (index === -1) return item;
    return { ...item, messages: item.messages.slice(0, index), updatedAt: Date.now() };
  });
}

/** 记录用户对某条助手消息的赞 / 踩（仅本地）。 */
export function setMessageFeedback(
  conversations: LocalConversation[],
  conversationId: string,
  messageId: string,
  feedback: "up" | "down" | undefined,
) {
  return conversations.map(item => {
    if (item.id !== conversationId) return item;
    return { ...item, messages: item.messages.map(message => message.id === messageId ? { ...message, feedback } : message) };
  });
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

export type SelectedModelCheck =
  | { ok: true; endpoint: string }
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

export async function checkSelectedModel(
  baseUrl: string,
  apiKey: string,
  model: string,
  request: typeof fetch = fetch,
): Promise<SelectedModelCheck> {
  const endpoint = modelEndpoint(baseUrl);
  if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
    return { ok: false, endpoint, message: "请先填写 API Base URL、API Key 并选择一个模型。" };
  }

  try {
    const response = await request(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: model.trim(),
        stream: false,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    if (response.ok) return { ok: true, endpoint };
    const payload = await response.json().catch(() => null) as { error?: { message?: string } | string } | null;
    const upstreamMessage = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
    if (response.status === 401 || response.status === 403) {
      return { ok: false, endpoint, message: "API Key 无效，或当前账户没有调用该模型的权限。" };
    }
    if (response.status === 404) {
      return { ok: false, endpoint, message: `没有找到「${model.trim()}」或聊天接口地址不正确。请重新获取模型后再选择。` };
    }
    if (response.status === 429) {
      return { ok: false, endpoint, message: "接口可达，但当前请求受限或账户额度不足。" };
    }
    return { ok: false, endpoint, message: upstreamMessage || `模型测试失败（HTTP ${response.status}）。请检查模型名称和服务状态。` };
  } catch {
    return { ok: false, endpoint, message: "浏览器无法访问聊天接口。请检查网络、HTTPS 地址或服务端是否允许跨域（CORS）。" };
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
