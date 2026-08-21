import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ENV } from "./_core/env";

const ALGORITHM = "aes-256-gcm";

function encryptionKey() {
  return createHash("sha256").update(ENV.cookieSecret).digest();
}

export function encryptApiKey(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString("base64url")).join(".");
}

export function decryptApiKey(value: string): string {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("保存的 API Key 无法读取，请重新填写。");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function isPrivateOrLocalHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

export function normalizeModelBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("请填写有效的 HTTPS API 地址。");
  }

  if (url.protocol !== "https:" || url.username || url.password || isPrivateOrLocalHost(url.hostname)) {
    throw new Error("仅允许使用公开可访问的 HTTPS API 地址。");
  }

  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export function getChatCompletionUrl(baseUrl: string): string {
  const normalized = normalizeModelBaseUrl(baseUrl);
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}
