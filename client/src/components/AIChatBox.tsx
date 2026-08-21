import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/lib/attachments";
import { prepareAttachment } from "@/lib/attachments";
import { Loader2, Send, User, Sparkles, Paperclip, X, FileText, Film } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

/**
 * Message type matching server-side LLM Message interface.
 * `attachments` 仅用户消息可能携带。
 */
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
  attachments?: Attachment[];
};

/** 发送给上层（页面）的载荷：文本 + 附件 */
export type SendPayload = {
  text: string;
  attachments: Attachment[];
};

export type AIChatBoxProps = {
  messages: Message[];
  /** 用户点击发送时回调，携带文本与附件 */
  onSendMessage: (payload: SendPayload) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  height?: string | number;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
  assistantName?: string;
  assistantAvatar?: string;
  userName?: string;
  userAvatar?: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.type.startsWith("image/");
  const isVideo = attachment.type.startsWith("video/");
  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      {isImage && attachment.url ? (
        <img src={attachment.url} alt={attachment.name} className="size-full object-cover" />
      ) : isVideo && attachment.url ? (
        <video src={attachment.url} className="size-full object-cover" muted />
      ) : isVideo ? (
        <Film className="size-6 text-muted-foreground" />
      ) : (
        <FileText className="size-6 text-muted-foreground" />
      )}
    </div>
  );
}

export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Type your message...",
  className,
  height = "600px",
  emptyStateMessage = "Start a conversation with AI",
  suggestedPrompts,
  assistantName = "AI",
  assistantAvatar,
  userName = "我",
  userAvatar,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // 用户是否“贴在底部”。向上翻看历史时置 false，新内容不再强行滚动。
  const stickToBottomRef = useRef(true);

  const displayMessages = messages.filter((msg) => msg.role !== "system");

  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    if (containerRef.current && inputAreaRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const inputHeight = inputAreaRef.current.offsetHeight;
      const scrollAreaHeight = containerHeight - inputHeight;
      const userMessageReservedHeight = 56;
      const calculatedHeight = scrollAreaHeight - 32 - userMessageReservedHeight;
      setMinHeightForLastMessage(Math.max(0, calculatedHeight));
    }
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 120;
  }, []);

  // 关键修复：新消息 / 流式输出时自动贴底。
  // displayMessages 在每次增量更新后都是新引用，因此这里会在流式过程中持续触发。
  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom("auto");
  }, [displayMessages, isLoading, scrollToBottom]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      try {
        next.push(await prepareAttachment(file));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `「${file.name}」添加失败。`);
      }
    }
    if (next.length > 0) setAttachments((previous) => [...previous, ...next]);
  }

  function removeAttachment(id: string) {
    setAttachments((previous) => previous.filter((item) => item.id !== id));
  }

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !isLoading;

  const send = (text: string, withAttachments: Attachment[]) => {
    onSendMessage({ text: text.trim(), attachments: withAttachments });
    setInput("");
    setAttachments([]);
    stickToBottomRef.current = true;
    scrollToBottom("auto");
    textareaRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    send(input, attachments);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm",
        className
      )}
      style={{ height }}
    >
      {/* Messages Area */}
      <div className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col p-4">
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground">
              <div className="flex flex-col items-center gap-3">
                <Sparkles className="size-12 opacity-20" />
                <p className="text-sm">{emptyStateMessage}</p>
              </div>

              {suggestedPrompts && suggestedPrompts.length > 0 && (
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => send(prompt, [])}
                      disabled={isLoading}
                      className="rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto"
          >
            <div className="flex flex-col space-y-4 p-4">
              {displayMessages.map((message, index) => {
                const isLastMessage = index === displayMessages.length - 1;
                const shouldApplyMinHeight =
                  isLastMessage && !isLoading && minHeightForLastMessage > 0;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex gap-3",
                      message.role === "user"
                        ? "justify-end items-start"
                        : "justify-start items-start"
                    )}
                    style={
                      shouldApplyMinHeight
                        ? { minHeight: `${minHeightForLastMessage}px` }
                        : undefined
                    }
                  >
                    {message.role === "assistant" && (
                      <div title={assistantName} className="size-8 shrink-0 mt-1 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
                        {assistantAvatar ? <img src={assistantAvatar} alt="" className="size-full object-cover" /> : <Sparkles className="size-4 text-primary" />}
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-4 py-2.5",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {message.role === "user" && message.attachments && message.attachments.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {message.attachments.map((att) => (
                            <div key={att.id} className="flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5">
                              <AttachmentThumb attachment={att} />
                              <div className="min-w-0 pr-1">
                                <p className="max-w-[140px] truncate text-xs font-medium">{att.name}</p>
                                <p className="text-[10px] opacity-70">{formatSize(att.size)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Streamdown>{message.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                      )}
                    </div>

                    {message.role === "user" && (
                      <div title={userName} className="size-8 shrink-0 mt-1 overflow-hidden rounded-full bg-secondary flex items-center justify-center">
                        {userAvatar ? <img src={userAvatar} alt="" className="size-full object-cover" /> : <User className="size-4 text-secondary-foreground" />}
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div
                  className="flex items-start gap-3"
                  style={
                    minHeightForLastMessage > 0
                      ? { minHeight: `${minHeightForLastMessage}px` }
                      : undefined
                  }
                >
                  <div title={assistantName} className="size-8 shrink-0 mt-1 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
                    {assistantAvatar ? <img src={assistantAvatar} alt="" className="size-full object-cover" /> : <Sparkles className="size-4 text-primary" />}
                  </div>
                  <div className="rounded-lg bg-muted px-4 py-2.5">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <form
        ref={inputAreaRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 p-4 border-t bg-background/50"
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-white px-2 py-1.5 shadow-sm"
              >
                <AttachmentThumb attachment={att} />
                <div className="min-w-0 pr-1">
                  <p className="max-w-[140px] truncate text-xs font-medium text-slate-700">{att.name}</p>
                  <p className="text-[10px] text-slate-400">{formatSize(att.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`移除 ${att.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="shrink-0 h-[38px] w-[38px] text-slate-500 hover:text-slate-900"
            aria-label="添加附件"
            title="添加附件（图片 / 视频 / PDF / Word 等）"
          >
            <Paperclip className="size-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 max-h-32 resize-none min-h-9"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!canSend}
            className="shrink-0 h-[38px] w-[38px]"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
