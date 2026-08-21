import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as db from "./db";
import { decryptApiKey, getChatCompletionUrl } from "./chatCrypto";
import { sdk } from "./_core/sdk";

const streamInput = z.object({
  conversationId: z.string().min(10).max(36),
  content: z.string().trim().min(1).max(8000),
});

function conversationTitle(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 32 ? `${normalized.slice(0, 32)}…` : normalized;
}

function writeEvent(res: Response, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function readDelta(block: string): string | null {
  const raw = block
    .split(/\r?\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trimStart())
    .join("\n");
  if (!raw || raw === "[DONE]") return null;

  try {
    const payload = JSON.parse(raw) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && /API Key|API 地址|配置|数据库/.test(error.message)) {
    return error.message;
  }
  return "模型服务暂时不可用，请检查配置后重试。";
}

export function registerChatStreamRoutes(app: Express) {
  app.post("/api/chat/stream", async (req: Request, res: Response) => {
    let responseFinished = false;
    let assistantText = "";
    let conversationId: string | null = null;
    let controller: AbortController | null = null;

    const abortOnDisconnect = () => {
      if (!responseFinished) controller?.abort();
    };
    res.on("close", abortOnDisconnect);

    try {
      const user = await sdk.authenticateRequest(req);
      const input = streamInput.parse(req.body);
      conversationId = input.conversationId;

      const conversation = await db.getConversationForUser(input.conversationId, user.id);
      if (!conversation) {
        res.status(404).json({ error: "未找到该会话。" });
        responseFinished = true;
        return;
      }

      const settings = await db.getUserModelSettings(user.id);
      if (!settings) {
        res.status(422).json({ error: "请先在设置中保存模型 API 配置。" });
        responseFinished = true;
        return;
      }

      const history = await db.listMessages(input.conversationId);
      await db.createMessage(nanoid(), input.conversationId, "user", input.content);
      await db.touchConversation(
        input.conversationId,
        history.length === 0 ? conversationTitle(input.content) : undefined
      );

      controller = new AbortController();
      const upstream = await fetch(getChatCompletionUrl(settings.baseUrl), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${decryptApiKey(settings.apiKeyEncrypted)}`,
        },
        body: JSON.stringify({
          model: settings.model,
          stream: true,
          messages: [
            { role: "system", content: "你是轻聊 AI，一个准确、友善、简洁的助手。" },
            ...history.map(message => ({ role: message.role, content: message.content })),
            { role: "user", content: input.content },
          ],
        }),
      });

      if (!upstream.ok || !upstream.body) {
        throw new Error("模型服务暂时不可用，请检查配置后重试。");
      }

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";

        for (const event of events) {
          const delta = readDelta(event);
          if (delta) {
            assistantText += delta;
            writeEvent(res, "delta", { delta });
          }
        }
      }

      if (assistantText.trim()) {
        await db.createMessage(nanoid(), input.conversationId, "assistant", assistantText);
        await db.touchConversation(input.conversationId);
      }
      writeEvent(res, "done", {});
      responseFinished = true;
      res.end();
    } catch (error) {
      if (conversationId && assistantText.trim()) {
        try {
          await db.createMessage(nanoid(), conversationId, "assistant", assistantText);
          await db.touchConversation(conversationId);
        } catch (persistError) {
          console.error("[Chat] Failed to save partial response", persistError);
        }
      }

      const message = safeErrorMessage(error);
      if (!res.headersSent) {
        const status = error instanceof z.ZodError ? 400 : 500;
        res.status(status).json({ error: message });
      } else if (!responseFinished) {
        writeEvent(res, "error", { error: message });
        responseFinished = true;
        res.end();
      }
    } finally {
      responseFinished = true;
      res.off("close", abortOnDisconnect);
    }
  });
}
