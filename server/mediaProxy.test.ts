import { describe, expect, it } from "vitest";
import { parseOriginList, validateUpstreamTarget } from "./mediaProxy";

describe("Vercel media proxy allowlist", () => {
  it("normalizes configured HTTPS origins", () => {
    expect([
      ...parseOriginList(
        "https://api.example.com/v1, https://cdn.example.com/"
      ),
    ]).toEqual(["https://api.example.com", "https://cdn.example.com"]);
  });

  it("rejects HTTP, credentials, and origins outside the allowlist", () => {
    const allowed = parseOriginList("https://api.example.com");
    expect(() =>
      validateUpstreamTarget("http://api.example.com/v1", allowed)
    ).toThrow("HTTPS");
    expect(() =>
      validateUpstreamTarget("https://user:pass@api.example.com/v1", allowed)
    ).toThrow("账号或密码");
    expect(() =>
      validateUpstreamTarget("https://evil.example/v1", allowed)
    ).toThrow("未获允许");
    expect(
      validateUpstreamTarget("https://api.example.com/v1/images", allowed)
        .pathname
    ).toBe("/v1/images");
  });

  it("fails closed when no upstream origin is configured", () => {
    expect(() =>
      validateUpstreamTarget("https://api.example.com/v1", new Set())
    ).toThrow("尚未配置");
  });
});
