import { COOKIE_NAME } from "@shared/const";
import { nanoid } from "nanoid";
import { z } from "zod";
import { encryptApiKey, normalizeModelBaseUrl } from "./chatCrypto";
import { getSessionCookieOptions } from "./_core/cookies";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import * as db from "./db";

const conversationId = z.string().min(10).max(36);
const title = z.string().trim().min(1).max(120);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  conversations: router({
    list: protectedProcedure.query(({ ctx }) => db.listConversations(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({ title: title.optional() }).optional())
      .mutation(({ ctx, input }) => db.createConversation(nanoid(), ctx.user.id, input?.title ?? "新对话")),
    rename: protectedProcedure
      .input(z.object({ id: conversationId, title }))
      .mutation(async ({ ctx, input }) => {
        const updated = await db.renameConversation(input.id, ctx.user.id, input.title);
        if (!updated) throw new Error("未找到该会话。");
        return updated;
      }),
    delete: protectedProcedure
      .input(z.object({ id: conversationId }))
      .mutation(async ({ ctx, input }) => {
        const deleted = await db.deleteConversation(input.id, ctx.user.id);
        if (!deleted) throw new Error("未找到该会话。");
        return { success: true } as const;
      }),
    messages: protectedProcedure
      .input(z.object({ conversationId }))
      .query(async ({ ctx, input }) => {
        const conversation = await db.getConversationForUser(input.conversationId, ctx.user.id);
        if (!conversation) throw new Error("未找到该会话。");
        return db.listMessages(input.conversationId);
      }),
  }),
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const settings = await db.getUserModelSettings(ctx.user.id);
      return settings
        ? { baseUrl: settings.baseUrl, model: settings.model, apiKeyConfigured: true, updatedAt: settings.updatedAt }
        : { baseUrl: "", model: "", apiKeyConfigured: false, updatedAt: null };
    }),
    save: protectedProcedure
      .input(z.object({
        baseUrl: z.string().trim().min(8).max(512),
        model: z.string().trim().min(1).max(160),
        apiKey: z.string().trim().min(1).max(1024).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const settings = await db.saveUserModelSettings({
          userId: ctx.user.id,
          baseUrl: normalizeModelBaseUrl(input.baseUrl),
          model: input.model,
          apiKeyEncrypted: input.apiKey ? encryptApiKey(input.apiKey) : undefined,
        });
        return { baseUrl: settings!.baseUrl, model: settings!.model, apiKeyConfigured: true };
      }),
  }),
  admin: router({
    users: adminProcedure.query(() => db.listUsersForAdmin()),
    updateRole: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(["user", "admin"]) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.id === input.userId && input.role !== "admin") {
          throw new Error("不能移除自己的管理员权限。");
        }
        await db.updateUserRole(input.userId, input.role);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
