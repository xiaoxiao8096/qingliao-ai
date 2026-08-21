import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getConversationForUser: vi.fn(),
  listMessages: vi.fn(),
  getUserModelSettings: vi.fn(),
  saveUserModelSettings: vi.fn(),
  listUsersForAdmin: vi.fn(),
  updateUserRole: vi.fn(),
}));

vi.mock("./chatCrypto", () => ({
  encryptApiKey: vi.fn(() => "encrypted-api-key"),
  normalizeModelBaseUrl: vi.fn(() => "https://api.example.com/v1"),
}));

import * as db from "./db";
import { appRouter } from "./routers";

function userContext(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "conversation-test-user",
      name: "Conversation Test",
      email: "conversation@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("conversation and settings routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes conversation creation, updates and deletion to the signed-in user", async () => {
    const caller = appRouter.createCaller(userContext());
    vi.mocked(db.createConversation).mockResolvedValue({ id: "conversation-123", userId: 42, title: "新对话" } as never);
    vi.mocked(db.renameConversation).mockResolvedValue({ id: "conversation-123", userId: 42, title: "已重命名" } as never);
    vi.mocked(db.deleteConversation).mockResolvedValue(1);

    await caller.conversations.create({ title: "新对话" });
    await caller.conversations.rename({ id: "conversation-123", title: "已重命名" });
    await caller.conversations.delete({ id: "conversation-123" });

    expect(db.createConversation).toHaveBeenCalledWith(expect.any(String), 42, "新对话");
    expect(db.renameConversation).toHaveBeenCalledWith("conversation-123", 42, "已重命名");
    expect(db.deleteConversation).toHaveBeenCalledWith("conversation-123", 42);
  });

  it("only reads message history after verifying the conversation belongs to the user", async () => {
    const caller = appRouter.createCaller(userContext());
    vi.mocked(db.getConversationForUser).mockResolvedValue({ id: "conversation-123", userId: 42, title: "测试" } as never);
    vi.mocked(db.listMessages).mockResolvedValue([{ id: "message-1", conversationId: "conversation-123", role: "user", content: "你好" }] as never);

    const result = await caller.conversations.messages({ conversationId: "conversation-123" });

    expect(db.getConversationForUser).toHaveBeenCalledWith("conversation-123", 42);
    expect(db.listMessages).toHaveBeenCalledWith("conversation-123");
    expect(result).toHaveLength(1);
  });

  it("stores normalized model settings against the signed-in user without returning the API key", async () => {
    const caller = appRouter.createCaller(userContext());
    vi.mocked(db.saveUserModelSettings).mockResolvedValue({
      userId: 42,
      baseUrl: "https://api.example.com/v1",
      model: "example-model",
      apiKeyEncrypted: "encrypted-api-key",
    } as never);

    const result = await caller.settings.save({
      baseUrl: "https://api.example.com/v1/",
      model: "example-model",
      apiKey: "sk-secret",
    });

    expect(db.saveUserModelSettings).toHaveBeenCalledWith({
      userId: 42,
      baseUrl: "https://api.example.com/v1",
      model: "example-model",
      apiKeyEncrypted: "encrypted-api-key",
    });
    expect(result).toEqual({
      baseUrl: "https://api.example.com/v1",
      model: "example-model",
      apiKeyConfigured: true,
    });
    expect(result).not.toHaveProperty("apiKey");
  });
});
