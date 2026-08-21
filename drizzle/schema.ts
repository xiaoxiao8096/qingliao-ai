import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const chatConversations = mysqlTable(
  "chat_conversations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull().default("新对话"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("conversation_user_updated_idx").on(table.userId, table.updatedAt)]
);

export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    conversationId: varchar("conversationId", { length: 36 })
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("message_conversation_created_idx").on(table.conversationId, table.createdAt)]
);

export const userModelSettings = mysqlTable(
  "user_model_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
    apiKeyEncrypted: text("apiKeyEncrypted").notNull(),
    model: varchar("model", { length: 160 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("user_model_settings_user_idx").on(table.userId)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type UserModelSettings = typeof userModelSettings.$inferSelect;
