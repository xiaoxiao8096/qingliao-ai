import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getConversationForUser: vi.fn(),
  getUserModelSettings: vi.fn(),
  listMessages: vi.fn(),
  createMessage: vi.fn(),
  touchConversation: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./db", () => ({
  getConversationForUser: mocks.getConversationForUser,
  getUserModelSettings: mocks.getUserModelSettings,
  listMessages: mocks.listMessages,
  createMessage: mocks.createMessage,
  touchConversation: mocks.touchConversation,
}));
vi.mock("./chatCrypto", () => ({
  decryptApiKey: vi.fn(() => "decrypted-server-only-key"),
  getChatCompletionUrl: vi.fn(() => "https://api.example.com/v1/chat/completions"),
}));

import { registerChatStreamRoutes } from "./chatStream";

describe("streaming chat endpoint", () => {
  it("persists both message sides and relays upstream deltas as server-sent events", async () => {
    let handler: ((req: any, res: any) => Promise<void>) | undefined;
    registerChatStreamRoutes({ post: (_path: string, routeHandler: typeof handler) => { handler = routeHandler; } } as any);

    mocks.authenticateRequest.mockResolvedValue({ id: 42 });
    mocks.getConversationForUser.mockResolvedValue({ id: "conversation-123", userId: 42, title: "新对话" });
    mocks.getUserModelSettings.mockResolvedValue({
      userId: 42,
      baseUrl: "https://api.example.com/v1",
      model: "example-model",
      apiKeyEncrypted: "encrypted-key",
    });
    mocks.listMessages.mockResolvedValue([]);
    mocks.createMessage.mockResolvedValue(undefined);
    mocks.touchConversation.mockResolvedValue(undefined);

    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(upstreamBody, { status: 200 }));

    const writes: string[] = [];
    const response = {
      headersSent: false,
      on: vi.fn(),
      off: vi.fn(),
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((value: string) => writes.push(value)),
      end: vi.fn(),
      json: vi.fn(),
    };

    await handler!({ body: { conversationId: "conversation-123", content: "你好" }, headers: {} }, response);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer decrypted-server-only-key" }),
      })
    );
    expect(mocks.createMessage).toHaveBeenNthCalledWith(1, expect.any(String), "conversation-123", "user", "你好");
    expect(mocks.createMessage).toHaveBeenNthCalledWith(2, expect.any(String), "conversation-123", "assistant", "你好，世界");
    expect(writes.join("")).toContain('event: delta');
    expect(writes.join("")).toContain("你好");
    expect(writes.join("")).toContain("event: done");
    fetchMock.mockRestore();
  });
});
