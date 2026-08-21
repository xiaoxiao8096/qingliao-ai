import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextWithRole(role: "user" | "admin" | null): TrpcContext {
  const user = role
    ? {
        id: 99,
        openId: "access-test-user",
        name: "Access Test",
        email: "access@example.com",
        loginMethod: "manus",
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      }
    : null;

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("chat application access control", () => {
  it("blocks anonymous visitors from protected conversation data", async () => {
    const caller = appRouter.createCaller(contextWithRole(null));
    await expect(caller.conversations.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks ordinary users from administrator user data", async () => {
    const caller = appRouter.createCaller(contextWithRole("user"));
    await expect(caller.admin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
