import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendAssistantDelta,
  appendLocalMessages,
  createConversation,
  dropEmptyAssistantMessage,
  getConversations,
  getSettings,
  initialTitle,
  modelEndpoint,
  parseSseEventBlock,
  removeLocalConversation,
  renameLocalConversation,
  saveConversations,
  saveSettings,
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

  it("creates compatible model endpoints and concise first-message titles", () => {
    expect(modelEndpoint("https://api.example.com/v1/")).toBe("https://api.example.com/v1/chat/completions");
    expect(modelEndpoint("https://api.example.com/v1/chat/completions")).toBe("https://api.example.com/v1/chat/completions");
    expect(initialTitle("  一段   用于测试标题的文字  ")).toBe("一段 用于测试标题的文字");
  });

  it("parses browser-compatible SSE deltas, done events and upstream errors", () => {
    expect(parseSseEventBlock('data: {"choices":[{"delta":{"content":"第一段"}}]}')).toMatchObject({ delta: "第一段", done: false });
    expect(parseSseEventBlock("data: [DONE]")).toMatchObject({ done: true });
    expect(parseSseEventBlock('data: {"error":{"message":"模型额度不足"}}')).toMatchObject({ error: "模型额度不足", done: false });
    expect(parseSseEventBlock("data: not-json")).toBeNull();
  });
});
