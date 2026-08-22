import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendAssistantDelta,
  appendLocalMessages,
  checkModelConnection,
  createConversation,
  dropEmptyAssistantMessage,
  getConversations,
  getLocalDraft,
  getSettings,
  initialTitle,
  modelEndpoint,
  parseSseEventBlock,
  removeLocalConversation,
  renameLocalConversation,
  saveConversations,
  saveLocalDraft,
  saveSettings,
  searchLocalConversations,
} from "./localChat";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("personal local chat storage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps model configuration on the current browser", () => {
    expect(getSettings()).toEqual({ baseUrl: "", apiKey: "", model: "" });

    saveSettings({ baseUrl: "https://api.example.com/v1", apiKey: "sk-local", model: "example-model" });

    expect(getSettings()).toEqual({ baseUrl: "https://api.example.com/v1", apiKey: "sk-local", model: "example-model" });
  });

  it("keeps unsent drafts isolated by their local AI and conversation key", () => {
    saveLocalDraft("ai-one:conversation-a", "保留这段草稿");
    saveLocalDraft("ai-two:conversation-a", "另一位 AI 的草稿");

    expect(getLocalDraft("ai-one:conversation-a")).toBe("保留这段草稿");
    expect(getLocalDraft("ai-two:conversation-a")).toBe("另一位 AI 的草稿");

    saveLocalDraft("ai-one:conversation-a", "");
    expect(getLocalDraft("ai-one:conversation-a")).toBe("");
    expect(getLocalDraft("ai-two:conversation-a")).toBe("另一位 AI 的草稿");
  });

  it("restores local conversations ordered by recent activity", () => {
    const older = { ...createConversation(), id: "older", updatedAt: 10, messages: [] };
    const newer = { ...createConversation(), id: "newer", updatedAt: 20, messages: [] };
    saveConversations([older, newer]);

    expect(getConversations().map(item => item.id)).toEqual(["newer", "older"]);
  });

  it("creates, renames, appends to and deletes local conversations without an account", () => {
    const conversation = { ...createConversation(), id: "conversation-1", title: "新对话", messages: [] };
    const renamed = renameLocalConversation([conversation], "conversation-1", "本地测试");
    const withMessages = appendLocalMessages(renamed, "conversation-1", [
      { id: "user-1", role: "user", content: "你好", createdAt: 1 },
      { id: "assistant-1", role: "assistant", content: "", createdAt: 2 },
    ]);
    const withDelta = appendAssistantDelta(withMessages, "conversation-1", "assistant-1", "你好，我在。");

    expect(withDelta[0].title).toBe("本地测试");
    expect(withDelta[0].messages[1].content).toBe("你好，我在。");
    expect(dropEmptyAssistantMessage(withDelta, "conversation-1", "assistant-1")[0].messages).toHaveLength(2);
    expect(removeLocalConversation(withDelta, "conversation-1")).toEqual([]);
  });

  it("searches local history by title and message content without crossing unrelated conversations", () => {
    const work = {
      ...createConversation("work-ai"),
      id: "work",
      title: "旅行计划",
      messages: [{ id: "message-1", role: "user" as const, content: "帮我安排杭州三日行程", createdAt: 1 }],
    };
    const notes = {
      ...createConversation("notes-ai"),
      id: "notes",
      title: "读书笔记",
      messages: [{ id: "message-2", role: "assistant" as const, content: "整理一份书单", createdAt: 2 }],
    };

    expect(searchLocalConversations([work, notes], "旅行").map(item => item.id)).toEqual(["work"]);
    expect(searchLocalConversations([work, notes], "书单").map(item => item.id)).toEqual(["notes"]);
    expect(searchLocalConversations([work, notes], "不存在")).toEqual([]);
    expect(searchLocalConversations([work, notes], "   ")).toHaveLength(2);
  });

  it("creates compatible model endpoints and concise first-message titles", () => {
    expect(modelEndpoint("https://api.example.com/v1/")).toBe("https://api.example.com/v1/chat/completions");
    expect(modelEndpoint("https://api.example.com/v1/chat/completions")).toBe("https://api.example.com/v1/chat/completions");
    expect(initialTitle("  一段   用于测试标题的文字  ")).toBe("一段 用于测试标题的文字");
  });

  it("diagnoses model connection states without sending a chat prompt", async () => {
    const accepted = await checkModelConnection(
      "https://api.example.com/v1",
      "sk-local",
      async () => new Response("{}", { status: 200 }),
    );
    const denied = await checkModelConnection(
      "https://api.example.com/v1",
      "sk-local",
      async () => new Response("{}", { status: 401 }),
    );
    const corsBlocked = await checkModelConnection(
      "https://api.example.com/v1",
      "sk-local",
      async () => { throw new TypeError("Failed to fetch"); },
    );

    expect(accepted).toMatchObject({ ok: true, endpoint: "https://api.example.com/v1/models" });
    expect(denied).toMatchObject({ ok: false, message: expect.stringContaining("API Key") });
    expect(corsBlocked).toMatchObject({ ok: false, message: expect.stringContaining("跨域") });
    await expect(checkModelConnection("", "", async () => new Response())).resolves.toMatchObject({ ok: false, message: expect.stringContaining("填写") });
  });

  it("parses browser-compatible SSE deltas, done events and upstream errors", () => {
    expect(parseSseEventBlock('data: {"choices":[{"delta":{"content":"第一段"}}]}')).toMatchObject({ delta: "第一段", done: false });
    expect(parseSseEventBlock("data: [DONE]")).toMatchObject({ done: true });
    expect(parseSseEventBlock('data: {"error":{"message":"模型额度不足"}}')).toMatchObject({ error: "模型额度不足", done: false });
    expect(parseSseEventBlock("data: not-json")).toBeNull();
  });
});
