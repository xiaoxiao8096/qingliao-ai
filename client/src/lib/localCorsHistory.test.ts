import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendCorsHistory, clearCorsHistory, getCorsHistory } from "./localCorsHistory";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}

describe("local CORS check history", () => {
  beforeEach(() => vi.stubGlobal("window", { localStorage: memoryStorage() }));
  afterEach(() => vi.unstubAllGlobals());

  it("stores only a sanitized endpoint and bounded diagnostic data", () => {
    appendCorsHistory("image", { ok: true, endpoint: "https://images.example.com/v1/create?api_key=private#token", status: 401, message: "browser can read this response" }, 1000);
    const history = getCorsHistory();
    expect(history[0]).toMatchObject({ capability: "image", endpoint: "https://images.example.com/v1/create", ok: true, status: 401 });
    expect(JSON.stringify(history)).not.toContain("api_key");
  });

  it("keeps only the latest records and supports clearing the current browser history", () => {
    for (let index = 0; index < 28; index += 1) appendCorsHistory("video", { ok: false, endpoint: `https://video.example.com/${index}`, message: "blocked" }, index);
    expect(getCorsHistory()).toHaveLength(24);
    clearCorsHistory();
    expect(getCorsHistory()).toEqual([]);
  });
});
