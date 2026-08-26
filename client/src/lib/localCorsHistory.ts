import type { EndpointCapability, MediaCorsCheck } from "./localMedia";

const CORS_HISTORY_KEY = "qingliao.personal.media-cors-history.v1";
const MAX_HISTORY_ITEMS = 24;

export type CorsHistoryItem = {
  id: string;
  capability: EndpointCapability;
  endpoint: string;
  ok: boolean;
  status?: number;
  message: string;
  checkedAt: number;
};

function storage() { return typeof window === "undefined" ? null : window.localStorage; }

function safeEndpoint(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 220);
  } catch { return value.split("?")[0].split("#")[0].slice(0, 220); }
}

function normalize(value: unknown): CorsHistoryItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CorsHistoryItem>;
  if (!["image", "speech", "music", "video"].includes(item.capability ?? "") || typeof item.endpoint !== "string" || typeof item.ok !== "boolean" || typeof item.message !== "string" || !Number.isFinite(item.checkedAt)) return null;
  return { id: typeof item.id === "string" ? item.id.slice(0, 80) : `cors-${item.checkedAt}`, capability: item.capability as EndpointCapability, endpoint: safeEndpoint(item.endpoint), ok: item.ok, status: typeof item.status === "number" ? item.status : undefined, message: item.message.slice(0, 280), checkedAt: item.checkedAt as number };
}

export function getCorsHistory(): CorsHistoryItem[] {
  try {
    const raw = storage()?.getItem(CORS_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalize).filter((item): item is CorsHistoryItem => Boolean(item)).slice(0, MAX_HISTORY_ITEMS) : [];
  } catch { return []; }
}

export function appendCorsHistory(capability: EndpointCapability, result: MediaCorsCheck, now = Date.now()) {
  const item: CorsHistoryItem = { id: `cors-${now}-${Math.random().toString(36).slice(2, 8)}`, capability, endpoint: safeEndpoint(result.endpoint), ok: result.ok, status: result.ok ? result.status : undefined, message: result.message.slice(0, 280), checkedAt: now };
  const next = [item, ...getCorsHistory()].slice(0, MAX_HISTORY_ITEMS);
  storage()?.setItem(CORS_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function clearCorsHistory() { storage()?.removeItem(CORS_HISTORY_KEY); }
