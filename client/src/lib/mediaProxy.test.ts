import { describe, expect, it } from "vitest";
import { mediaRequestTarget } from "./mediaProxy";

describe("media proxy request routing", () => {
  it("keeps static builds on the provider endpoint", () => {
    const request = mediaRequestTarget(
      "https://api.example.com/v1/images",
      { method: "POST" },
      ""
    );
    expect(request.url).toBe("https://api.example.com/v1/images");
    expect(new Headers(request.init.headers).has("x-qingliao-upstream")).toBe(
      false
    );
  });

  it("routes Vercel builds through the same-origin proxy without dropping headers", () => {
    const request = mediaRequestTarget(
      "https://api.example.com/v1/images",
      {
        method: "POST",
        headers: {
          authorization: "Bearer local-key",
          "content-type": "application/json",
        },
      },
      "/api/media-proxy"
    );
    const headers = new Headers(request.init.headers);
    expect(request.url).toBe("/api/media-proxy");
    expect(headers.get("x-qingliao-upstream")).toBe(
      "https://api.example.com/v1/images"
    );
    expect(headers.get("authorization")).toBe("Bearer local-key");
  });
});
