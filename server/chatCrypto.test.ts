import { describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, getChatCompletionUrl, normalizeModelBaseUrl } from "./chatCrypto";

describe("model setting security helpers", () => {
  it("encrypts API keys without retaining plaintext and restores them on the server", () => {
    const source = "sk-private-example-key";
    const encrypted = encryptApiKey(source);

    expect(encrypted).not.toContain(source);
    expect(encrypted.split(".")).toHaveLength(3);
    expect(decryptApiKey(encrypted)).toBe(source);
  });

  it("only accepts public HTTPS model endpoints", () => {
    expect(normalizeModelBaseUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
    expect(() => normalizeModelBaseUrl("http://api.example.com/v1")).toThrow(/HTTPS/);
    expect(() => normalizeModelBaseUrl("https://127.0.0.1/v1")).toThrow(/公开可访问/);
    expect(() => normalizeModelBaseUrl("https://192.168.1.8/v1")).toThrow(/公开可访问/);
  });

  it("creates an OpenAI-compatible chat completion endpoint", () => {
    expect(getChatCompletionUrl("https://api.example.com/v1")).toBe("https://api.example.com/v1/chat/completions");
    expect(getChatCompletionUrl("https://api.example.com/v1/chat/completions")).toBe("https://api.example.com/v1/chat/completions");
  });
});
