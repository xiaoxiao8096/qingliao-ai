export type AssetKind = "image" | "audio" | "video" | "html" | "markdown" | "pdf" | "docx" | "pptx" | "text" | "other";
export type AssetSource = "import" | "generated";

export type LocalAsset = {
  id: string;
  name: string;
  kind: AssetKind;
  mimeType: string;
  size: number;
  category: string;
  source: AssetSource;
  createdAt: number;
  updatedAt: number;
};

type StoredAsset = LocalAsset & { blob: Blob };

const DB_NAME = "qingliao-local-asset-library";
const DB_VERSION = 1;
const STORE_NAME = "assets";
export const MAX_LOCAL_ASSET_BYTES = 100 * 1024 * 1024;

const extensionKind: Record<string, AssetKind> = {
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", avif: "image", svg: "image",
  mp3: "audio", wav: "audio", m4a: "audio", ogg: "audio", aac: "audio", flac: "audio",
  mp4: "video", webm: "video", mov: "video", m4v: "video",
  html: "html", htm: "html", md: "markdown", markdown: "markdown", pdf: "pdf", doc: "docx", docx: "docx", ppt: "pptx", pptx: "pptx",
  txt: "text", json: "text", csv: "text", js: "text", ts: "text", tsx: "text", css: "text", xml: "text", yml: "text", yaml: "text",
};

const kindLabels: Record<AssetKind, string> = {
  image: "图片", audio: "音频", video: "视频", html: "HTML", markdown: "Markdown", pdf: "PDF", docx: "Word", pptx: "PPT", text: "文本与代码", other: "其他文件",
};

function extensionOf(name: string) {
  const extension = name.trim().toLocaleLowerCase().split(".").pop();
  return extension && extension !== name.toLocaleLowerCase() ? extension : "";
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function databaseAvailable() {
  return typeof indexedDB !== "undefined";
}

function openAssetDatabase(): Promise<IDBDatabase> {
  if (!databaseAvailable()) return Promise.reject(new Error("当前浏览器不支持本机素材库。请使用较新的 Safari、Chrome 或 Edge。"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("本机素材库无法打开。"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("kind", "kind");
        store.createIndex("category", "category");
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function assetWithoutBlob(asset: StoredAsset): LocalAsset {
  const { blob: _blob, ...metadata } = asset;
  return metadata;
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openAssetDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onerror = () => reject(request.error ?? new Error("本机素材库操作失败。"));
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("本机素材库操作失败。")); };
  });
}

export function classifyAsset(name: string, mimeType = ""): AssetKind {
  const extension = extensionOf(name);
  if (extensionKind[extension]) return extensionKind[extension];
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("wordprocessingml")) return "docx";
  if (mimeType.includes("presentationml")) return "pptx";
  if (mimeType.startsWith("text/")) return "text";
  return "other";
}

export function assetKindLabel(kind: AssetKind) {
  return kindLabels[kind];
}

export function normalizeAssetCategory(value: string, fallbackKind: AssetKind) {
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 24);
  return cleaned || assetKindLabel(fallbackKind);
}

export function formatAssetSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export async function saveLocalAsset(file: Blob & { name?: string; type?: string }, options: { name?: string; category?: string; source?: AssetSource } = {}): Promise<LocalAsset> {
  if (!file.size) throw new Error("不能保存空文件。");
  if (file.size > MAX_LOCAL_ASSET_BYTES) throw new Error("单个文件不能超过 100MB，以保护当前浏览器的本机存储空间。");
  const name = (options.name ?? file.name ?? "未命名素材").trim().slice(0, 120) || "未命名素材";
  const mimeType = file.type || "application/octet-stream";
  const kind = classifyAsset(name, mimeType);
  const now = Date.now();
  const record: StoredAsset = {
    id: newId(), name, kind, mimeType, size: file.size, category: normalizeAssetCategory(options.category ?? "", kind), source: options.source ?? "import", createdAt: now, updatedAt: now, blob: file,
  };
  await withStore("readwrite", store => store.add(record));
  return assetWithoutBlob(record);
}

export async function listLocalAssets(): Promise<LocalAsset[]> {
  const records = await withStore<StoredAsset[]>("readonly", store => store.getAll());
  return records.map(assetWithoutBlob).sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getLocalAsset(id: string): Promise<(LocalAsset & { blob: Blob }) | null> {
  const record = await withStore<StoredAsset | undefined>("readonly", store => store.get(id));
  return record ?? null;
}

export async function updateLocalAsset(id: string, patch: Pick<Partial<LocalAsset>, "name" | "category">): Promise<LocalAsset> {
  const existing = await getLocalAsset(id);
  if (!existing) throw new Error("素材不存在或已删除。");
  const next: StoredAsset = {
    ...existing,
    name: patch.name === undefined ? existing.name : (patch.name.trim().slice(0, 120) || existing.name),
    category: patch.category === undefined ? existing.category : normalizeAssetCategory(patch.category, existing.kind),
    updatedAt: Date.now(),
  };
  await withStore("readwrite", store => store.put(next));
  return assetWithoutBlob(next);
}

export async function deleteLocalAsset(id: string) {
  await withStore("readwrite", store => store.delete(id));
}

export async function localAssetStorageEstimate() {
  const estimate = await navigator.storage?.estimate?.();
  return { usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0 };
}
