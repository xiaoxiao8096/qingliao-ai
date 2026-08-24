import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/lib/attachments";
import { prepareAttachment } from "@/lib/attachments";
import { getLocalDraft, saveLocalDraft } from "@/lib/localChat";
import { Loader2, Send, User, Sparkles, Paperclip, X, FileText, Film, Copy, Square, ArrowDown, Mic, MicOff, RefreshCw, ThumbsUp, ThumbsDown, Pencil, Trash2, Check } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

/**
 * Message type matching server-side LLM Message interface.
 * `attachments` 仅用户消息可能携带。`createdAt` 用于显示发送时间。
 */
export type Message = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  createdAt?: number;
  /** 用户对助手消息的反馈（仅本地） */
  feedback?: "up" | "down";
};

/** 发送给上层（页面）的载荷：文本 + 附件。编辑重发时携带 editMessageId。 */
export type SendPayload = {
  text: string;
  attachments: Attachment[];
  editMessageId?: string;
};

export type AIChatBoxProps = {
  messages: Message[];
  /** 用户点击发送时回调，携带文本与附件 */
  onSendMessage: (payload: SendPayload) => void;
  /** 流式生成中点「停止」时回调（由上层 abort 请求） */
  onStop?: () => void;
  /** 点击「重新生成」某条助手消息时回调 */
  onRegenerate?: (messageId: string) => void;
  /** 点击「删除」某条消息时回调 */
  onDeleteMessage?: (messageId: string) => void;
  /** 用户对某条助手消息点赞 / 踩 */
  onFeedback?: (messageId: string, value: "up" | "down") => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  height?: string | number;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
  /** 点击后填入输入框的常用提示词卡片。 */
  promptShortcuts?: ReadonlyArray<{ id: string; title: string; prompt: string }>;
  assistantName?: string;
  assistantAvatar?: string;
  userName?: string;
  userAvatar?: string;
  /** 当前 AI 保存的本机聊天背景图片。 */
  backgroundImage?: string;
  /** 背景图片模糊程度，单位为像素。 */
  backgroundBlur?: number;
  /** 背景图片的亮度与对比度。 */
  backgroundBrightness?: number;
  backgroundContrast?: number;
  /** 背景图片上的浅色保护层透明度。 */
  backgroundOpacity?: number;
  /** 背景图片缩放比例与定位。 */
  backgroundScale?: number;
  backgroundPositionX?: number;
  backgroundPositionY?: number;
  /** Optional local-storage key used to restore an unsent draft. */
  draftKey?: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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
  onStop,
  onRegenerate,
  onDeleteMessage,
  onFeedback,
  isLoading = false,
  placeholder = "Type your message...",
  className,
  height = "600px",
  emptyStateMessage = "Start a conversation with AI",
  suggestedPrompts,
  promptShortcuts,
  assistantName = "AI",
  assistantAvatar,
  userName = "我",
  userAvatar,
  backgroundImage,
  backgroundBlur = 0,
  backgroundBrightness = 100,
  backgroundContrast = 100,
  backgroundOpacity = 0.72,
  backgroundScale = 100,
  backgroundPositionX = 50,
  backgroundPositionY = 50,
  draftKey,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  // 用户是否“贴在底部”。向上翻看历史时置 false，新内容不再强行滚动。
  const stickToBottomRef = useRef(true);
  // 是否显示“回到最新”悬浮按钮（用户上翻时为真）。
  const [showJump, setShowJump] = useState(false);
  // 正在编辑并重发的用户消息 id（非空时发送按钮变为“保存并重发”）。
  const [editingId, setEditingId] = useState<string | null>(null);

  // 语音输入（Web Speech API）。录音时把识别结果实时写回输入框。
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const recordingBaseRef = useRef("");
  const supportsSpeech =
    typeof window !== "undefined" &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(() => () => { try { recognitionRef.current?.stop(); } catch { /* noop */ } }, []);

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("当前浏览器不支持语音输入，请使用 Chrome 或 Edge。"); return; }
    try {
      const recognition = new SR();
      recognition.lang = "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = true;
      let finalized = "";
      recordingBaseRef.current = input;
      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) finalized += result[0].transcript;
          else interim += result[0].transcript;
        }
        const next = recordingBaseRef.current + finalized + interim;
        setInput(next);
        adjustTextarea();
      };
      recognition.onend = () => { setIsRecording(false); };
      recognition.onerror = (event: any) => {
        setIsRecording(false);
        if (event?.error && event.error !== "no-speech" && event.error !== "aborted") {
          toast.error(`语音识别出错：${event.error}`);
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } catch {
      toast.error("无法启动语音识别，请检查浏览器麦克风权限。");
    }
  }

  const displayMessages = messages.filter((msg) => msg.role !== "system");

  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    setInput(draftKey ? getLocalDraft(draftKey) : "");
  }, [draftKey]);

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
    if (!el) return;
    if (behavior === "smooth") {
      messageEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    setShowJump(false);
  }, []);

  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);

  const copyMessage = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动选择文本。");
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 120;
    setShowJump(distanceFromBottom >= 120);
  }, []);

  const lastMessageContent = displayMessages.at(-1)?.content ?? "";

  // 新消息、流式文本增长或 Markdown 内容重排时都贴底；用户主动上滑后则保留阅读位置。
  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    const frame = requestAnimationFrame(() => scrollToBottom("auto"));
    return () => cancelAnimationFrame(frame);
  }, [displayMessages.length, lastMessageContent, isLoading, scrollToBottom]);

  useEffect(() => {
    const content = messageContentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) requestAnimationFrame(() => scrollToBottom("auto"));
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [displayMessages.length, scrollToBottom]);

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
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch { /* noop */ } recognitionRef.current = null; setIsRecording(false); }
    onSendMessage({ text: text.trim(), attachments: withAttachments, editMessageId: editingId ?? undefined });
    setInput("");
    if (draftKey) saveLocalDraft(draftKey, "");
    setAttachments([]);
    setEditingId(null);
    stickToBottomRef.current = true;
    scrollToBottom("auto");
    adjustTextarea();
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
      <div className="chat-message-area relative flex-1 min-h-0 overflow-hidden">
        {backgroundImage && <div aria-hidden="true" className="pointer-events-none absolute inset-0 scale-105" style={{ backgroundImage: `linear-gradient(rgb(255 255 255 / ${backgroundOpacity}), rgb(255 255 255 / ${backgroundOpacity})), url("${backgroundImage}")`, backgroundPosition: `${backgroundPositionX}% ${backgroundPositionY}%`, backgroundRepeat: "no-repeat", backgroundSize: `${backgroundScale}%`, filter: `blur(${backgroundBlur}px) brightness(${backgroundBrightness}%) contrast(${backgroundContrast}%)` }} />}
        <div className="relative z-[1] h-full">
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

              {promptShortcuts && promptShortcuts.length > 0 && (
                <div className="w-full max-w-2xl">
                  <p className="mb-2 text-center text-xs font-medium text-muted-foreground">常用提示词 · 点击后可继续编辑</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {promptShortcuts.map((shortcut) => (
                      <button
                        key={shortcut.id}
                        type="button"
                        onClick={() => {
                          setInput(shortcut.prompt);
                          adjustTextarea();
                          requestAnimationFrame(() => textareaRef.current?.focus());
                        }}
                        disabled={isLoading}
                        className="rounded-xl border border-border bg-card/90 px-3 py-2.5 text-left text-sm font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {shortcut.title}
                      </button>
                    ))}
                  </div>
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
            <div ref={messageContentRef} className="flex flex-col space-y-4 p-4">
              {displayMessages.map((message, index) => {
                const isLastMessage = index === displayMessages.length - 1;
                const shouldApplyMinHeight =
                  isLastMessage && !isLoading && minHeightForLastMessage > 0;
                const isUser = message.role === "user";
                const isAssistant = message.role === "assistant";

                const startEdit = () => {
                  if (!isUser) return;
                  setInput(message.content);
                  setEditingId(message.id);
                  adjustTextarea();
                  textareaRef.current?.focus();
                };

                const actionBtn =
                  "grid size-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-700";

                return (
                  <div
                    key={message.id}
                    className={cn(
                      "group/msg flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                      isUser
                        ? "justify-end items-start"
                        : "justify-start items-start"
                    )}
                    style={
                      shouldApplyMinHeight
                        ? { minHeight: `${minHeightForLastMessage}px` }
                        : undefined
                    }
                  >
                    {isAssistant && (
                      <div title={assistantName} className="size-8 shrink-0 mt-1 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
                        {assistantAvatar ? <img src={assistantAvatar} alt="" className="size-full object-cover" /> : <Sparkles className="size-4 text-primary" />}
                      </div>
                    )}

                    <div className={cn("flex min-w-0 flex-col", isUser ? "items-end" : "items-start")}>
                      <div
                        className={cn(
                          "chat-bubble group relative max-w-[80%] rounded-lg px-4 py-2.5",
                          isUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {isUser && message.attachments && message.attachments.length > 0 && (
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
                        {isAssistant ? (
                          <div className="prose prose-sm max-w-none break-words">
                            <Streamdown isAnimating={isLoading} shikiTheme={["github-light", "github-dark"]} controls={{ code: true }}>{message.content}</Streamdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                        )}
                        {message.createdAt ? (
                          <div className="mt-1 text-right text-[10px] opacity-60">{formatTime(message.createdAt)}</div>
                        ) : null}
                      </div>

                      <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100">
                        {isAssistant && (
                          <button type="button" onClick={() => onRegenerate?.(message.id)} className={actionBtn} aria-label="重新生成" title="重新生成">
                            <RefreshCw className="size-3.5" />
                          </button>
                        )}
                        {isUser && (
                          <button type="button" onClick={startEdit} className={actionBtn} aria-label="编辑并重发" title="编辑并重发">
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                        <button type="button" onClick={() => copyMessage(message.content)} className={actionBtn} aria-label="复制" title="复制">
                          <Copy className="size-3.5" />
                        </button>
                        {isAssistant && (
                          <>
                            <button type="button" onClick={() => onFeedback?.(message.id, "up")} className={cn(actionBtn, message.feedback === "up" && "text-emerald-500 hover:text-emerald-600")} aria-label="赞" title="赞">
                              <ThumbsUp className="size-3.5" />
                            </button>
                            <button type="button" onClick={() => onFeedback?.(message.id, "down")} className={cn(actionBtn, message.feedback === "down" && "text-rose-500 hover:text-rose-600")} aria-label="踩" title="踩">
                              <ThumbsDown className="size-3.5" />
                            </button>
                          </>
                        )}
                        <button type="button" onClick={() => onDeleteMessage?.(message.id)} className={cn(actionBtn, "hover:bg-rose-50 hover:text-rose-500")} aria-label="删除" title="删除">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {isUser && (
                      <div title={userName} className="size-8 shrink-0 mt-1 overflow-hidden rounded-full bg-secondary flex items-center justify-center">
                        {userAvatar ? <img src={userAvatar} alt="" className="size-full object-cover" /> : <User className="size-4 text-secondary-foreground" />}
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex items-start gap-3 chat-message-thinking"
                  style={
                    minHeightForLastMessage > 0
                      ? { minHeight: `${minHeightForLastMessage}px` }
                      : undefined
                  }
                >
                  <div title={assistantName} className="size-8 shrink-0 mt-1 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
                    {assistantAvatar ? <img src={assistantAvatar} alt="" className="size-full object-cover" /> : <Sparkles className="size-4 text-primary" />}
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-muted px-4 py-3">
                    <span className="chat-typing-dot" />
                    <span className="chat-typing-dot [animation-delay:120ms]" />
                    <span className="chat-typing-dot [animation-delay:240ms]" />
                  </div>
                </div>
              )}
              <div ref={messageEndRef} aria-hidden="true" className="h-px" />
            </div>
          </div>
          )}
        </div>

        {showJump && (
          <button
            type="button"
            onClick={() => { stickToBottomRef.current = true; scrollToBottom("smooth"); }}
            className="absolute bottom-4 right-4 z-10 grid size-9 place-items-center rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-700"
            aria-label="回到最新消息"
            title="回到最新消息"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>

      {/* Input Area */}
      <form
        ref={inputAreaRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 p-4 border-t bg-background/50"
      >
        {editingId && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <span className="flex items-center gap-1.5"><Pencil className="size-3.5" /> 正在编辑这条消息，发送后将重新生成后续回复。</span>
            <button type="button" onClick={() => setEditingId(null)} className="shrink-0 rounded-md px-2 py-0.5 font-medium hover:bg-amber-100">取消</button>
          </div>
        )}
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
            onChange={(e) => {
              const value = e.target.value;
              setInput(value);
              if (draftKey) saveLocalDraft(draftKey, value);
              adjustTextarea();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 max-h-32 resize-none min-h-9"
            rows={1}
          />
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              onClick={() => onStop?.()}
              className="shrink-0 h-[38px] w-[38px] bg-rose-500 text-white hover:bg-rose-600"
              aria-label="停止生成"
              title="停止生成"
            >
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            <>
              {supportsSpeech && (
                <Button
                  type="button"
                  size="icon"
                  onClick={toggleRecording}
                  className={cn(
                    "shrink-0 h-[38px] w-[38px]",
                    isRecording
                      ? "bg-rose-500 text-white animate-pulse hover:bg-rose-600"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                  aria-label={isRecording ? "停止语音输入" : "语音输入"}
                  title={isRecording ? "正在聆听，点击停止" : "语音输入（点击后开始说话）"}
                >
                  {isRecording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </Button>
              )}
              <Button
                type="submit"
                size="icon"
                disabled={!canSend}
                className="shrink-0 h-[38px] w-[38px]"
                aria-label={editingId ? "保存并重发" : "发送"}
                title={editingId ? "保存并重发" : "发送"}
              >
                {editingId ? <Check className="size-4" /> : <Send className="size-4" />}
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
