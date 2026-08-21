import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  chatConversations,
  chatMessages,
  InsertUser,
  userModelSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("数据库当前不可用，请稍后重试。");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  textFields.forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listConversations(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(chatConversations.updatedAt));
}

export async function createConversation(id: string, userId: number, title = "新对话") {
  const db = await requireDb();
  await db.insert(chatConversations).values({ id, userId, title });
  return getConversationForUser(id, userId);
}

export async function getConversationForUser(id: string, userId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, userId)))
    .limit(1);
  return result[0];
}

export async function renameConversation(id: string, userId: number, title: string) {
  const db = await requireDb();
  await db
    .update(chatConversations)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, userId)));
  return getConversationForUser(id, userId);
}

export async function deleteConversation(id: string, userId: number) {
  const db = await requireDb();
  const result = await db
    .delete(chatConversations)
    .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, userId)));
  return result[0]?.affectedRows ?? 0;
}

export async function listMessages(conversationId: string) {
  const db = await requireDb();
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt);
}

export async function createMessage(
  id: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string
) {
  const db = await requireDb();
  await db.insert(chatMessages).values({ id, conversationId, role, content });
}

export async function touchConversation(id: string, title?: string) {
  const db = await requireDb();
  await db
    .update(chatConversations)
    .set({ ...(title ? { title } : {}), updatedAt: new Date() })
    .where(eq(chatConversations.id, id));
}

export async function getUserModelSettings(userId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(userModelSettings)
    .where(eq(userModelSettings.userId, userId))
    .limit(1);
  return result[0];
}

export async function saveUserModelSettings({
  userId,
  baseUrl,
  model,
  apiKeyEncrypted,
}: {
  userId: number;
  baseUrl: string;
  model: string;
  apiKeyEncrypted?: string;
}) {
  const db = await requireDb();
  const existing = await getUserModelSettings(userId);
  if (!existing && !apiKeyEncrypted) {
    throw new Error("首次保存需要填写 API Key。");
  }

  await db.insert(userModelSettings).values({
    userId,
    baseUrl,
    model,
    apiKeyEncrypted: apiKeyEncrypted ?? existing!.apiKeyEncrypted,
  }).onDuplicateKeyUpdate({
    set: {
      baseUrl,
      model,
      ...(apiKeyEncrypted ? { apiKeyEncrypted } : {}),
      updatedAt: new Date(),
    },
  });

  return getUserModelSettings(userId);
}

export async function listUsersForAdmin() {
  const db = await requireDb();
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      loginMethod: users.loginMethod,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.lastSignedIn));
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await requireDb();
  await db.update(users).set({ role }).where(eq(users.id, userId));
}
