import { AIChatBox, type Message as ChatMessage } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import {
  appendAssistantDelta,
  appendLocalMessages,
  conversationsForAI,
  createConversation,
  createId,
  dropEmptyAssistantMessage,
  getConversations,
  initialTitle,
  modelEndpoint,
  parseSseEventBlock,
  removeLocalConversation,
  removeMessageAndAfter,
  renameLocalConversation,
  saveConversations,
  searchLocalConversations,
  setLocalConversationGroup,
  toggleLocalConversationPin,
  setMessageFeedback,
  truncateAfter,
  updateMessageContent,
  type LocalConversation,
} from "@/lib/localChat";
import { useThemePreference } from "@/contexts/ThemeContext";
import { toPersistedAttachment, type Attachment } from "@/lib/attachments";
import { DEFAULT_AI_APPEARANCE, getActiveAIId, getAIProfiles, getUserProfile, saveAIProfiles, setActiveAIId, type AIAppearance, type LocalAIProfile } from "@/lib/localProfiles";
import {
  Check,
  ChevronRight,
  CircleHelp,
  Menu,
  MessageSquarePlus,
  Moon,
  Pencil,
  Pin,
  Search,
  Settings,
  Sun,
  Trash2,
  UserRound,
  Monitor,
  FolderPlus,
  Palette,
  Type,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type StreamMessage = { id: string; role: "user" | "assistant"; content: string; attachments?: Attachment[]; feedback?: "up" | "down"; createdAt?: number };

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

function buildContent(message: { content?: string; attachments?: Attachment[] }): string | ContentPart[] {
  const parts: ContentPart[] = [];
  if (message.content?.trim()) parts.push({ type: "text", text: message.content });
  for (const attachment of message.attachments ?? []) {
    if (attachment.url) {
      if (attachment.type.startsWith("image/")) parts.push({ type: "image_url", image_url: { url: attachment.url } });
      else if (attachment.type.startsWith("video/")) parts.push({ type: "video_url", video_url: { url: attachment.url } });
      else parts.push({ type: "file", file: { filename: attachment.name, file_data: attachment.url } });
    }
    if (attachment.text && (!attachment.url || attachment.type.startsWith("text/") || attachment.type === "application/json")) {
      parts.push({ type: "text", text: `【附件 ${attachment.name}】\n${attachment.text}` });
    }
  }
  if (parts.length === 0) return message.content ?? "";
  return parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
}

function updateStoredConversations(
  setConversations: React.Dispatch<React.SetStateAction<LocalConversation[]>>,
  mutate: (conversations: LocalConversation[]) => LocalConversation[],
) {
  setConversations(previous => {
    const next = mutate(previous).sort((a, b) => b.updatedAt - a.updatedAt);
    saveConversations(next);
    return next;
  });
}

function buildSystemPrompt(ai: LocalAIProfile, user: { name: string }): string {
  const parts = [`你是 ${ai.name}。`];
  if (ai.persona?.trim()) parts.push(`${ai.persona.trim().replace(/[。.]+$/, "")}。`);
  if (user.name.trim() && user.name.trim() !== "我") parts.push(`用户的名字是 ${user.name.trim()}，请直接称呼其名字，让交流更自然。`);
  parts.push("你准确、友善、简洁；除非用户要求，否则使用中文回复。");
  return parts.join("");
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "AI";
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profiles, setProfiles] = useState<LocalAIProfile[]>(() => getAIProfiles());
  const [activeAIId, setCurrentAIId] = useState(() => getActiveAIId());
  const [conversations, setConversations] = useState<LocalConversation[]>(() => getConversations());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [conversationQuery, setConversationQuery] = useState("");
  const [groupingId, setGroupingId] = useState<string | null>(null);
  const [groupValue, setGroupValue] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [managingGroup, setManagingGroup] = useState<string | null>(null);
  const [groupManagerValue, setGroupManagerValue] = useState("");
  const { preference, setPreference, accent, setAccent, fontScale, setFontScale, bubbleRadius, setBubbleRadius, chatTexture, setChatTexture } = useThemePreference();

  const userProfile = getUserProfile();
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  const activeAI = profiles.find(profile => profile.id === activeAIId) ?? profiles[0];

  useEffect(() => {
    const appearance = { ...DEFAULT_AI_APPEARANCE, ...activeAI?.appearance };
    setAccent(appearance.accent);
    setFontScale(appearance.fontScale);
    setBubbleRadius(appearance.bubbleRadius);
    setChatTexture(appearance.chatTexture);
  }, [activeAI?.id]);

  function updateActiveAppearance(patch: Partial<AIAppearance>) {
    if (!activeAI) return;
    const appearance = { ...DEFAULT_AI_APPEARANCE, ...activeAI.appearance, ...patch };
    const next = profiles.map(profile => profile.id === activeAI.id ? { ...profile, appearance, updatedAt: Date.now() } : profile);
    setProfiles(next);
    saveAIProfiles(next);
    if (patch.accent) setAccent(patch.accent);
    if (patch.fontScale) setFontScale(patch.fontScale);
    if (patch.bubbleRadius) setBubbleRadius(patch.bubbleRadius);
    if (patch.chatTexture) setChatTexture(patch.chatTexture);
  }
  const currentConversations = useMemo(
    () => activeAI ? conversationsForAI(conversations, activeAI.id) : [],
    [activeAI, conversations],
  );
  const conversationGroups = useMemo(() => Array.from(new Set(currentConversations.map(item => item.group).filter((group): group is string => Boolean(group)))).sort(), [currentConversations]);
  const matchingConversations = useMemo(
    () => searchLocalConversations(currentConversations, conversationQuery).filter(item => groupFilter === "all" || (groupFilter === "ungrouped" ? !item.group : item.group === groupFilter)),
    [conversationQuery, currentConversations, groupFilter],
  );
  const activeConversation = currentConversations.find(item => item.id === activeConversationId) ?? null;
  const messages = useMemo<StreamMessage[]>(() => activeConversation?.messages.map(message => ({ id: message.id, role: message.role, content: message.content, attachments: message.attachments, feedback: message.feedback, createdAt: message.createdAt })) ?? [], [activeConversation]);
  const isConfigured = Boolean(activeAI?.baseUrl && activeAI?.apiKey && activeAI?.model);

  useEffect(() => {
    if (!activeConversationId || !currentConversations.some(item => item.id === activeConversationId)) {
      setActiveConversationId(currentConversations[0]?.id ?? null);
    }
  }, [activeConversationId, currentConversations]);

  function startConversation() {
    if (!activeAI) return;
    const conversation = createConversation(activeAI.id);
    updateStoredConversations(setConversations, previous => [conversation, ...previous]);
    setActiveConversationId(conversation.id);
    setConversationQuery("");
    setDrawerOpen(false);
  }

  function selectAI(id: string) {
    setActiveAIId(id);
    setCurrentAIId(id);
    setActiveConversationId(null);
    setConversationQuery("");
    setDrawerOpen(false);
  }

  function beginRename(conversation: LocalConversation) {
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  function saveRename(id: string) {
    const title = renameValue.trim();
    if (!title) {
      toast.message("会话名称不能为空。");
      return;
    }

    updateStoredConversations(setConversations, previous => renameLocalConversation(previous, id, title));
    cancelRename();
    toast.success("会话已重命名。");
  }

  function removeConversation(id: string) {
    if (!window.confirm("删除后，该会话与其中的消息将无法恢复。是否继续？")) return;
    const next = removeLocalConversation(currentConversations, id);
    updateStoredConversations(setConversations, previous => removeLocalConversation(previous, id));
    if (activeConversationId === id) setActiveConversationId(next[0]?.id ?? null);
    toast.success("会话已删除。");
  }

  function togglePin(id: string) {
    updateStoredConversations(setConversations, previous => toggleLocalConversationPin(previous, id));
  }

  function saveGroup(id: string) {
    updateStoredConversations(setConversations, previous => setLocalConversationGroup(previous, id, groupValue));
    setGroupingId(null);
    setGroupValue("");
    toast.success("会话分类已更新。");
  }

  function renameGroup(oldGroup: string) {
    const nextGroup = groupManagerValue.trim().slice(0, 32);
    if (!nextGroup) return;
    updateStoredConversations(setConversations, previous => previous.map(item => item.group === oldGroup ? { ...item, group: nextGroup } : item));
    if (groupFilter === oldGroup) setGroupFilter(nextGroup);
    setManagingGroup(null);
    toast.success("分类已重命名。");
  }

  function clearGroup(group: string) {
    updateStoredConversations(setConversations, previous => previous.map(item => item.group === group ? { ...item, group: undefined } : item));
    if (groupFilter === group) setGroupFilter("all");
    setManagingGroup(null);
    toast.success("已清空该分类下的会话标签。");
  }

  /** 通用流式回复：向模型发送 [history + 最后一条用户消息]，把增量写入 assistantId。 */
  async function streamReply(
    conversationId: string,
    history: { role: "user" | "assistant"; content: string | ContentPart[] }[],
    finalUser: { content: string; attachments: Attachment[] },
    assistantId: string,
  ) {
    if (!activeAI) return;
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(modelEndpoint(activeAI.baseUrl), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${activeAI.apiKey}` }, signal: controller.signal, body: JSON.stringify({ model: activeAI.model, stream: true, messages: [{ role: "system", content: buildSystemPrompt(activeAI, getUserProfile()) }, ...history, { role: "user", content: buildContent({ content: finalUser.content, attachments: finalUser.attachments }) }] }) });
      if (!response.ok || !response.body) { const payload = await response.json().catch(() => null) as { error?: { message?: string } | string } | null; const reason = typeof payload?.error === "string" ? payload.error : payload?.error?.message; throw new Error(reason ?? "模型服务没有响应，请检查当前 AI 的配置。"); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const chunks = buffer.split(/\r?\n\r?\n/); buffer = chunks.pop() ?? ""; for (const chunk of chunks) { const parsed = parseSseEventBlock(chunk); if (!parsed) continue; if (parsed.error) throw new Error(parsed.error); if (parsed.delta) updateStoredConversations(setConversations, previous => appendAssistantDelta(previous, conversationId, assistantId, parsed.delta)); } }
    } catch (error) { if ((error as Error)?.name === "AbortError") { toast.message("已停止生成。"); } else { updateStoredConversations(setConversations, previous => dropEmptyAssistantMessage(previous, conversationId, assistantId)); toast.error(error instanceof Error ? error.message : "发送失败，请检查 API 设置或网络。"); } } finally { abortRef.current = null; setIsStreaming(false); }
  }

  async function sendMessage(payload: { text: string; attachments: Attachment[]; editMessageId?: string }) {
    const { text, attachments, editMessageId } = payload;
    if (!activeAI || !isConfigured) { toast.message("请先配置当前 AI 的模型 API。", { action: { label: "管理 AI", onClick: () => setLocation("/ais") } }); return; }
    if (!activeConversation) return;

    // 编辑并重发：更新原用户消息内容，丢弃其后所有回复，再重新生成。
    if (editMessageId) {
      const msgs = activeConversation.messages;
      const idx = msgs.findIndex(m => m.id === editMessageId);
      if (idx >= 0) {
        const before = msgs.slice(0, idx).map(m => ({ role: m.role, content: buildContent(m) }));
        updateStoredConversations(setConversations, previous => {
          let next = updateMessageContent(previous, activeConversation!.id, editMessageId, text, attachments.map(toPersistedAttachment));
          next = truncateAfter(next, activeConversation!.id, editMessageId);
          return next;
        });
        const assistantMessage = { id: createId(), role: "assistant" as const, content: "", createdAt: Date.now() };
        updateStoredConversations(setConversations, previous => appendLocalMessages(previous, activeConversation!.id, [assistantMessage]));
        await streamReply(activeConversation.id, before, { content: text, attachments }, assistantMessage.id);
        return;
      }
    }

    let conversationId = activeConversationId; let conversation = activeConversation;
    if (!conversationId || !conversation) { conversation = createConversation(activeAI.id); conversationId = conversation.id; updateStoredConversations(setConversations, previous => [conversation!, ...previous]); setActiveConversationId(conversationId); }
    const userMessage = { id: createId(), role: "user" as const, content: text, createdAt: Date.now(), attachments: attachments.map(toPersistedAttachment) };
    const assistantMessage = { id: createId(), role: "assistant" as const, content: "", createdAt: Date.now() };
    const history = conversation.messages.map(message => ({ role: message.role, content: buildContent(message) }));
    updateStoredConversations(setConversations, previous => appendLocalMessages(previous, conversationId, [userMessage, assistantMessage], conversation!.messages.length === 0 ? initialTitle(text) : undefined));
    await streamReply(conversationId, history, { content: text, attachments }, assistantMessage.id);
  }

  function regenerate(assistantMessageId: string) {
    if (!activeAI || !isConfigured || !activeConversation) return;
    const msgs = activeConversation.messages;
    const idx = msgs.findIndex(m => m.id === assistantMessageId);
    if (idx <= 0) return; // 需要其前存在一条用户消息
    let userIdx = idx - 1;
    while (userIdx >= 0 && msgs[userIdx].role !== "user") userIdx--;
    if (userIdx < 0) return;
    const userMessage = msgs[userIdx];
    const before = msgs.slice(0, userIdx).map(m => ({ role: m.role, content: buildContent(m) }));
    const assistantMessage = { id: createId(), role: "assistant" as const, content: "", createdAt: Date.now() };
    updateStoredConversations(setConversations, previous => {
      let next = truncateAfter(previous, activeConversation!.id, userMessage.id);
      next = appendLocalMessages(next, activeConversation!.id, [assistantMessage]);
      return next;
    });
    streamReply(activeConversation.id, before, { content: userMessage.content, attachments: userMessage.attachments ?? [] }, assistantMessage.id);
  }

  function deleteMessage(messageId: string) {
    if (!activeConversation) return;
    updateStoredConversations(setConversations, previous => removeMessageAndAfter(previous, activeConversation!.id, messageId));
    toast.success("已删除该消息及其后的回复。");
  }

  function setFeedback(messageId: string, value: "up" | "down") {
    if (!activeConversation) return;
    const current = activeConversation.messages.find(m => m.id === messageId)?.feedback;
    updateStoredConversations(setConversations, previous => setMessageFeedback(previous, activeConversation!.id, messageId, current === value ? undefined : value));
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  const conversationPanel = (
    <aside className="flex h-full w-[min(85vw,320px)] flex-col bg-[#f8fafb] px-3 pb-4 pt-4 shadow-[12px_0_35px_rgba(36,54,69,0.08)] lg:w-[300px] lg:shadow-none">
      <div className="flex items-center justify-between px-2 pb-4">
        <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-left" aria-label="回到聊天主页">
          <span className="grid size-8 place-items-center rounded-xl bg-[#dceefa] text-[#417698]"><CircleHelp className="size-4" /></span>
          <span>
            <span className="block text-sm font-black tracking-tight text-slate-900">轻聊 AI</span>
            <span className="block text-[10px] font-semibold tracking-[0.16em] text-slate-400">PRIVATE · LOCAL</span>
          </span>
        </button>
        <button onClick={() => setDrawerOpen(false)} className="grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-200 lg:hidden" aria-label="关闭会话面板"><X className="size-4" /></button>
      </div>

      <button onClick={() => setLocation("/ais")} className="mb-3 flex w-full items-center gap-2 rounded-xl bg-white p-2 text-left shadow-sm hover:bg-[#edf6fb]">
        <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-[#dceefa] text-xs font-bold text-[#3f7698]">
          {activeAI?.avatar ? <img src={activeAI.avatar} alt="" className="size-full object-cover" /> : initials(activeAI?.name ?? "AI")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-700">{activeAI?.name ?? "选择 AI"}</span>
          <span className="block text-[11px] text-slate-400">点击切换或编辑</span>
        </span>
        <ChevronRight className="size-4 text-slate-300" />
      </button>

      <Button onClick={startConversation} className="mb-4 h-11 justify-start gap-2 rounded-xl bg-slate-900 px-4 text-white hover:bg-slate-700">
        <MessageSquarePlus className="size-4" /> 新对话
      </Button>

      <p className="px-2 pb-2 text-[10px] font-bold tracking-[0.16em] text-slate-400">{activeAI?.name ?? "当前 AI"} 的对话</p>
      {currentConversations.length > 0 && (
        <div className="relative mb-3 px-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <label className="sr-only" htmlFor="conversation-search">搜索当前 AI 的对话</label>
          <input
            id="conversation-search"
            value={conversationQuery}
            onChange={event => setConversationQuery(event.target.value)}
            placeholder="搜索对话"
            className="h-9 w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          />
          {conversationQuery && (
            <button onClick={() => setConversationQuery("")} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="清除搜索">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
      {currentConversations.length > 0 && <select value={groupFilter} onChange={event => setGroupFilter(event.target.value)} className="mb-3 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600" aria-label="按分类筛选会话"><option value="all">全部分类</option><option value="ungrouped">未分类</option>{conversationGroups.map(group => <option key={group} value={group}>{group}</option>)}</select>}
      {conversationGroups.length > 0 && <div className="mb-3 space-y-1 px-1"><p className="text-[10px] font-bold tracking-[0.12em] text-slate-400">管理分类</p>{conversationGroups.map(group => managingGroup === group ? <form key={group} onSubmit={event => { event.preventDefault(); renameGroup(group); }} className="flex gap-1"><input autoFocus value={groupManagerValue} onChange={event => setGroupManagerValue(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" /><button className="rounded-lg bg-sky-100 px-2 text-xs text-sky-700">改名</button><button type="button" onClick={() => clearGroup(group)} className="rounded-lg px-2 text-xs text-rose-500">清空</button></form> : <button key={group} onClick={() => { setManagingGroup(group); setGroupManagerValue(group); }} className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs text-slate-500 hover:bg-white"><span className="truncate">{group}</span><Pencil className="size-3" /></button>)}</div>}

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label="会话历史">
        {currentConversations.length === 0 ? (
          <p className="px-2 py-4 text-sm leading-6 text-slate-400">这个 AI 还没有对话。每个 AI 的记录会分开保存。</p>
        ) : matchingConversations.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm leading-6 text-slate-400">没有找到匹配的对话。<button onClick={() => setConversationQuery("")} className="block w-full pt-1 text-sky-700 hover:underline">清除搜索</button></div>
        ) : (
          matchingConversations.map(conversation => (
            <div key={conversation.id} className={`group rounded-xl ${activeConversationId === conversation.id ? "bg-white shadow-sm" : "hover:bg-white/70"}`}>
              {renamingId === conversation.id ? (
                <form
                  className="flex gap-1 p-1.5"
                  onSubmit={event => {
                    event.preventDefault();
                    saveRename(conversation.id);
                  }}
                >
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={event => setRenameValue(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Escape") cancelRename();
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-sky-300"
                    maxLength={120}
                    aria-label="会话名称"
                  />
                  <button type="submit" className="grid size-7 place-items-center rounded-lg bg-[#e1eff8] text-[#3f7698]" aria-label="保存标题"><Check className="size-3.5" /></button>
                  <button type="button" onClick={cancelRename} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="取消重命名"><X className="size-3.5" /></button>
                </form>
              ) : (
                <div className="flex items-center gap-1 p-1.5">
                  <button onClick={() => { setActiveConversationId(conversation.id); setDrawerOpen(false); }} className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm text-slate-700">{conversation.title}</button>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => togglePin(conversation.id)} className={`grid size-7 place-items-center rounded-lg ${conversation.pinned ? "bg-amber-50 text-amber-600" : "text-slate-400 hover:bg-slate-100"}`} aria-label={conversation.pinned ? "取消置顶" : "置顶会话"}><Pin className={`size-3 ${conversation.pinned ? "fill-current" : ""}`} /></button>
                    <button onClick={() => { setGroupingId(conversation.id); setGroupValue(conversation.group ?? ""); }} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="分类会话"><FolderPlus className="size-3" /></button>
                    <button onClick={() => beginRename(conversation)} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="重命名会话"><Pencil className="size-3" /></button>
                    <button onClick={() => removeConversation(conversation.id)} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label="删除会话"><Trash2 className="size-3" /></button>
                  </div>
                  {conversation.group && <span className="mb-1 ml-3 inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">{conversation.group}</span>}
                  {groupingId === conversation.id && <form onSubmit={event => { event.preventDefault(); saveGroup(conversation.id); }} className="flex gap-1 p-1.5"><input autoFocus value={groupValue} onChange={event => setGroupValue(event.target.value)} placeholder="例如：工作、学习" maxLength={32} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none" /><button type="submit" className="rounded-lg bg-sky-100 px-2 text-xs text-sky-700">保存</button><button type="button" onClick={() => setGroupingId(null)} className="rounded-lg px-2 text-xs text-slate-400">取消</button></form>}
                </div>
              )}
            </div>
          ))
        )}
      </nav>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-white p-1 text-slate-500 shadow-sm"><button onClick={() => setPreference("light")} className={`grid h-8 place-items-center rounded-lg ${preference === "light" ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"}`} aria-label="浅色模式"><Sun className="size-3.5" /></button><button onClick={() => setPreference("dark")} className={`grid h-8 place-items-center rounded-lg ${preference === "dark" ? "bg-slate-800 text-white" : "hover:bg-slate-100"}`} aria-label="深色模式"><Moon className="size-3.5" /></button><button onClick={() => setPreference("system")} className={`grid h-8 place-items-center rounded-lg ${preference === "system" ? "bg-slate-100 text-slate-700" : "hover:bg-slate-100"}`} aria-label="跟随系统主题"><Monitor className="size-3.5" /></button></div>
        <div className="mb-2 rounded-xl bg-white p-2 shadow-sm"><div className="mb-1 flex items-center justify-between text-[10px] font-bold tracking-[0.1em] text-slate-400"><span className="flex items-center gap-1"><Palette className="size-3" />{activeAI?.name ?? "当前 AI"} 的主题</span><button onClick={() => updateActiveAppearance(DEFAULT_AI_APPEARANCE)} className="text-sky-700 hover:underline">恢复默认</button></div><div className="flex items-center justify-between gap-1">{(["sky", "violet", "rose", "emerald", "amber"] as const).map(color => <button key={color} onClick={() => updateActiveAppearance({ accent: color })} className={`grid size-6 place-items-center rounded-full ${accent === color ? "ring-2 ring-slate-500 ring-offset-2" : ""}`} aria-label={`选择${color}主题色`}><span className={`size-4 rounded-full bg-[var(--accent-${color})]`} /></button>)}</div><div className="mt-2 rounded-lg bg-[var(--accent)] p-2 text-[10px] text-[var(--accent-foreground)]" aria-label="当前配色预览"><div className="flex items-center justify-between"><span>当前配色预览</span><span className="rounded-md bg-[var(--primary)] px-2 py-1 text-[var(--primary-foreground)]">发送</span></div><span className="chat-bubble mt-1 block bg-white/65 px-2 py-1">这是一条消息气泡</span></div><div className="mb-1 mt-3 text-[10px] font-bold tracking-[0.1em] text-slate-400">气泡圆角</div><div className="grid grid-cols-3 gap-1">{([['soft','柔和'],['rounded','圆润'],['pill','胶囊']] as const).map(([value,label]) => <button key={value} onClick={() => updateActiveAppearance({ bubbleRadius: value })} className={`rounded-lg py-1 text-[11px] ${bubbleRadius === value ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"}`}>{label}</button>)}</div><div className="mb-1 mt-3 text-[10px] font-bold tracking-[0.1em] text-slate-400">聊天背景</div><div className="grid grid-cols-4 gap-1">{([['plain','纯色'],['dots','圆点'],['grid','网格'],['paper','纸张']] as const).map(([value,label]) => <button key={value} onClick={() => updateActiveAppearance({ chatTexture: value })} className={`rounded-lg py-1 text-[10px] ${chatTexture === value ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"}`}>{label}</button>)}</div><div className="mb-1 mt-3 flex items-center gap-1 text-[10px] font-bold tracking-[0.1em] text-slate-400"><Type className="size-3" />字体大小</div><div className="grid grid-cols-3 gap-1"><button onClick={() => updateActiveAppearance({ fontScale: "small" })} className={`rounded-lg py-1 text-[11px] ${fontScale === "small" ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"}`}>小</button><button onClick={() => updateActiveAppearance({ fontScale: "medium" })} className={`rounded-lg py-1 text-[12px] ${fontScale === "medium" ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"}`}>标准</button><button onClick={() => updateActiveAppearance({ fontScale: "large" })} className={`rounded-lg py-1 text-sm ${fontScale === "large" ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"}`}>大</button></div></div>
        <button onClick={() => setLocation("/ais")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-white"><Settings className="size-4 text-slate-400" /> 管理我的 AI <ChevronRight className="ml-auto size-4 text-slate-300" /></button>
        <button onClick={() => setLocation("/profile")} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-white">
          <span className="grid size-6 place-items-center overflow-hidden rounded-full bg-[#f7dfe7] text-[10px] font-bold text-[#9b5267]">{userProfile.avatar ? <img src={userProfile.avatar} alt="" className="size-full object-cover" /> : userProfile.name.slice(0, 1)}</span>
          <span className="min-w-0 flex-1 truncate">{userProfile.name}</span>
          <UserRound className="size-4 text-slate-400" />
        </button>
      </div>
    </aside>
  );

  return (
    <main className="flex h-dvh overflow-hidden bg-[#f3f6f8] text-slate-900">
      <div className="hidden h-full shrink-0 lg:block">{conversationPanel}</div>
      {drawerOpen && <div className="fixed inset-0 z-50 lg:hidden"><button onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-slate-900/25" aria-label="关闭会话面板" />{conversationPanel}</div>}
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute -right-16 top-5 size-52 rounded-full bg-[#dceefa]/70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 size-56 rounded-full bg-[#f7dfe7]/60 blur-3xl" />
        <header className="relative z-10 flex h-16 shrink-0 items-center justify-between px-4 sm:px-7">
          <button onClick={() => setDrawerOpen(true)} className="grid size-10 place-items-center rounded-xl bg-white text-slate-600 shadow-sm lg:hidden" aria-label="打开会话面板"><Menu className="size-5" /></button>
          <div className="hidden lg:block"><p className="text-xs font-semibold tracking-[0.16em] text-slate-400">{activeAI?.name ?? "私人 AI"}</p><h1 className="mt-0.5 text-base font-black tracking-tight text-slate-900">{activeConversation?.title ?? "新对话"}</h1></div>
          <div className="ml-auto flex items-center gap-2"><span className={`hidden rounded-full px-3 py-1 text-xs font-medium sm:inline-flex ${isConfigured ? "bg-[#e7f4ed] text-[#39745c]" : "bg-[#fff2e9] text-[#a65b2a]"}`}>{isConfigured ? `${activeAI?.name} 已配置` : "等待配置"}</span><button onClick={() => setLocation("/ais")} className="grid size-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm hover:text-slate-900" aria-label="管理 AI"><Settings className="size-4" /></button></div>
        </header>
        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0 sm:px-7 sm:pb-6">
          <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-[0_12px_46px_rgba(43,58,72,0.08)] sm:rounded-[1.5rem]">
            <AIChatBox
              className="h-full rounded-none border-0 bg-transparent shadow-none"
              height="100%"
              messages={messages}
              onSendMessage={sendMessage}
              onStop={stopGeneration}
              onRegenerate={regenerate}
              onDeleteMessage={deleteMessage}
              onFeedback={setFeedback}
              isLoading={isStreaming}
              placeholder={isConfigured ? `向 ${activeAI?.name} 发送消息` : "请先前往管理 AI 配置模型"}
              emptyStateMessage={activeAI?.welcome?.trim() || (isConfigured ? `开始和 ${activeAI?.name} 聊聊` : "先完成当前 AI 的模型设置，再开始对话")}
              suggestedPrompts={isConfigured ? ["帮我把这段文字表达得更清楚", "今天有什么值得学习的新知识？"] : undefined}
              assistantName={activeAI?.name}
              assistantAvatar={activeAI?.avatar}
              userName={userProfile.name}
              userAvatar={userProfile.avatar}
              draftKey={`${activeAI?.id ?? "no-ai"}:${activeConversationId ?? "new"}`}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
