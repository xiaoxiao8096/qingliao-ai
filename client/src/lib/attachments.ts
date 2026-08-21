/**
 * 附件类型与文件读取工具。
 *
 * 设计要点：
 * - 浏览器直连多模态模型（OpenAI 兼容 /chat/completions）。
 * - 图片 / 视频 / 文档都会在本地转成 base64 data URL，作为多模态 content part 发给模型。
 * - 文本类文件（txt/md/csv/json 等）会额外抽取纯文本，方便模型直接理解。
 * - url 可能为空：当消息从历史存储中恢复、且当时出于体积考虑没有持久化 data URL 时。
 */

export type Attachment = {
  id: string;
  name: string;
  /** MIME type，例如 image/png、application/pdf */
  type: string;
  size: number;
  /** base64 data URL，发送模型时使用；历史恢复时可能为空 */
  url?: string;
  /** 文本类文件抽取出的纯文本 */
  text?: string;
};

/** 单文件硬上限，避免把超大文件读进内存拖垮浏览器 */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** 持久化到 localStorage 时，data URL 超过此长度就不再保存（避免撑爆配额），但本次发送仍然有效 */
export const PERSIST_URL_MAX_LENGTH = 3_500_000;

export function isTextLike(type: string, name: string) {
  if (/^text\//.test(type)) return true;
  if (type === "application/json" || type === "application/xml") return true;
  return /\.(txt|md|markdown|csv|json|log|xml|yml|yaml)$/i.test(name);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败，请重试。"));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("文本文件读取失败。"));
    reader.readAsText(file);
  });
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 把一个 File 处理成可发送的 Attachment（含 base64 data URL）。 */
export async function prepareAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`「${file.name}」超过 50MB，暂不支持。`);
  }
  const base: Omit<Attachment, "url" | "text"> = {
    id: newId(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
  };
  const url = await readFileAsDataUrl(file);
  let text: string | undefined;
  if (isTextLike(base.type, base.name) && file.size <= 2 * 1024 * 1024) {
    try {
      text = await readFileAsText(file);
    } catch {
      text = undefined;
    }
  }
  return { ...base, url, text };
}

/** 仅保留历史持久化需要的最小字段，避免把超大 base64 写进 localStorage。 */
export function toPersistedAttachment(attachment: Attachment): Attachment {
  const { url, ...rest } = attachment;
  return {
    ...rest,
    url: url && url.length <= PERSIST_URL_MAX_LENGTH ? url : undefined,
  };
}
