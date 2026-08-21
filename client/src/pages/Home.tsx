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
  renameLocalConversation,
  saveConversations,
  type LocalConversation,
} from "@/lib/localChat";
import { toPersistedAttachment, type Attachment } from "@/lib/attachments";
import { getActiveAIId, getAIProfiles, getUserProfile, setActiveAIId, type LocalAIProfile } from "@/lib/localProfiles";
import { Check, ChevronRight, CircleHelp, Menu, MessageSquarePlus, Pencil, Plus, Settings, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type StreamMessage = { role: "user" | "assistant"; content: string; attachments?: Attachment[] };

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

/**
 * 把一条本地消息转换成发送给多模态模型的 content。
 * - 纯文本 → string（与旧行为一致）。
 * - 带附件 → content part 数组：图片走 image_url，视频走 video_url，其余走 file，文本类附带纯文本。
 * 注意：video_url / file 这类 part 是否被模型支持，取决于你配置的具体多模态接口；图片则普遍支持。
 */
function buildContent(message: { content?: string; attachments?: Attachment[] }): string | ContentPart[] {
  const parts: ContentPart[] = [];
  if (message.content && message.content.trim()) parts.push({ type: "text", text: message.content });
  for (const att of message.attachments ?? []) {
    if (att.url) {
      if (att.type.startsWith("image/")) parts.push({ type: "image_url", image_url: { url: att.url } });
      else if (att.type.startsWith("video/")) parts.push({ type: "video_url", video_url: { url: att.url } });
      else parts.push({ type: "file", file: { filename: att.name, file_data: att.url } });
    }
    if (att.text && (!att.url || att.type.startsWith("text/") || att.type === "application/json")) {
      parts.push({ type: "text", text: `【附件 ${att.name}】\n${att.text}` });
    }
  }
  if (parts.length === 0) return message.content ?? "";
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
  return parts;
}

function updateStoredConversations(setConversations: React.Dispatch<React.SetStateAction<LocalConversation[]>>, mutate: (conversations: LocalConversation[]) => LocalConversation[]) {
  setConversations(previous => { const next = mutate(previous).sort((a, b) => b.updatedAt - a.updatedAt); saveConversations(next); return next; });
}

function initials(name: string) { return name.trim().slice(0, 1).toUpperCase() || "AI"; }

export default function Home() {
  const [, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profiles] = useState<LocalAIProfile[]>(() => getAIProfiles());
  const [activeAIId, setCurrentAIId] = useState(() => getActiveAIId());
  const [conversations, setConversations] = useState<LocalConversation[]>(() => getConversations());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const userProfile = getUserProfile();
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  const activeAI = profiles.find(profile => profile.id === activeAIId) ?? profiles[0];
  const currentConversations = useMemo(() => activeAI ? conversationsForAI(conversations, activeAI.id) : [], [activeAI, conversations]);
  const activeConversation = currentConversations.find(item => item.id === activeConversationId) ?? null;
  const messages = useMemo<StreamMessage[]>(() => activeConversation?.messages.map(message => ({ role: message.role, content: message.content, attachments: message.attachments, createdAt: message.createdAt })) ?? [], [activeConversation]);
  const isConfigured = Boolean(activeAI?.baseUrl && activeAI?.apiKey && activeAI?.model);

  useEffect(() => { if (!activeConversationId || !currentConversations.some(item => item.id === activeConversationId)) setActiveConversationId(currentConversations[0]?.id ?? null); }, [activeConversationId, currentConversations]);

  function startConversation() {
    if (!activeAI) return;
    const conversation = createConversation(activeAI.id);
    updateStoredConversations(setConversations, previous => [conversation, ...previous]);
    setActiveConversationId(conversation.id); setDrawerOpen(false);
  }

  function selectAI(id: string) { setActiveAIId(id); setCurrentAIId(id); setActiveConversationId(null); setDrawerOpen(false); }
  function saveRename(id: string) { const title = renameValue.trim(); if (!title) return; updateStoredConversations(setConversations, previous => renameLocalConversation(previous, id, title)); setRenamingId(null); }
  function removeConversation(id: string) { if (!window.confirm("删除后，该会话与其中的消息将无法恢复。是否继续？")) return; const next = removeLocalConversation(currentConversations, id); updateStoredConversations(setConversations, previous => removeLocalConversation(previous, id)); if (activeConversationId === id) setActiveConversationId(next[0]?.id ?? null); toast.success("会话已删除。"); }

  async function sendMessage(payload: { text: string; attachments: Attachment[] }) {
    const { text, attachments } = payload;
    if (!activeAI || !isConfigured) { toast.message("请先配置当前 AI 的模型 API。", { action: { label: "管理 AI", onClick: () => setLocation("/ais") } }); return; }
    let conversationId = activeConversationId; let conversation = activeConversation;
    if (!conversationId || !conversation) { conversation = createConversation(activeAI.id); conversationId = conversation.id; updateStoredConversations(setConversations, previous => [conversation!, ...previous]); setActiveConversationId(conversationId); }
    const userMessage = { id: createId(), role: "user" as const, content: text, createdAt: Date.now(), attachments: attachments.map(toPersistedAttachment) };
    const assistantMessage = { id: createId(), role: "assistant" as const, content: "", createdAt: Date.now() };
    const history = conversation.messages.map(message => ({ role: message.role, content: buildContent(message) }));
    updateStoredConversations(setConversations, previous => appendLocalMessages(previous, conversationId, [userMessage, assistantMessage], conversation!.messages.length === 0 ? initialTitle(text) : undefined));
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(modelEndpoint(activeAI.baseUrl), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${activeAI.apiKey}` }, signal: controller.signal, body: JSON.stringify({ model: activeAI.model, stream: true, messages: [{ role: "system", content: `你是 ${activeAI.name}，一个准确、友善、简洁的助手。` }, ...history, { role: "user", content: buildContent({ content: text, attachments }) }] }) });
      if (!response.ok || !response.body) { const payload = await response.json().catch(() => null) as { error?: { message?: string } | string } | null; const reason = typeof payload?.error === "string" ? payload.error : payload?.error?.message; throw new Error(reason ?? "模型服务没有响应，请检查当前 AI 的配置。"); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const chunks = buffer.split(/\r?\n\r?\n/); buffer = chunks.pop() ?? ""; for (const chunk of chunks) { const parsed = parseSseEventBlock(chunk); if (!parsed) continue; if (parsed.error) throw new Error(parsed.error); if (parsed.delta) updateStoredConversations(setConversations, previous => appendAssistantDelta(previous, conversationId, assistantMessage.id, parsed.delta)); } }
    } catch (error) { if ((error as Error)?.name === "AbortError") { toast.message("已停止生成。"); } else { updateStoredConversations(setConversations, previous => dropEmptyAssistantMessage(previous, conversationId, assistantMessage.id)); toast.error(error instanceof Error ? error.message : "发送失败，请检查 API 设置或网络。"); } } finally { abortRef.current = null; setIsStreaming(false); }
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  const conversationPanel = <aside className="flex h-full w-[min(85vw,320px)] flex-col bg-[#f8fafb] px-3 pb-4 pt-4 shadow-[12px_0_35px_rgba(36,54,69,0.08)] lg:w-[300px] lg:shadow-none"><div className="flex items-center justify-between px-2 pb-4"><button onClick={() => setLocation("/")} className="flex items-center gap-2 text-left" aria-label="回到聊天主页"><span className="grid size-8 place-items-center rounded-xl bg-[#dceefa] text-[#417698]"><CircleHelp className="size-4" /></span><span><span className="block text-sm font-black tracking-tight text-slate-900">轻聊 AI</span><span className="block text-[10px] font-semibold tracking-[0.16em] text-slate-400">PRIVATE · LOCAL</span></span></button><button onClick={() => setDrawerOpen(false)} className="grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-200 lg:hidden" aria-label="关闭会话面板"><X className="size-4" /></button></div><button onClick={() => setLocation("/ais")} className="mb-3 flex w-full items-center gap-2 rounded-xl bg-white p-2 text-left shadow-sm hover:bg-[#edf6fb]"><span className="grid size-9 place-items-center overflow-hidden rounded-full bg-[#dceefa] text-xs font-bold text-[#3f7698]">{activeAI?.avatar ? <img src={activeAI.avatar} alt="" className="size-full object-cover" /> : initials(activeAI?.name ?? "AI")}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-700">{activeAI?.name ?? "选择 AI"}</span><span className="block text-[11px] text-slate-400">点击切换或编辑</span></span><ChevronRight className="size-4 text-slate-300" /></button><Button onClick={startConversation} className="mb-5 h-11 justify-start gap-2 rounded-xl bg-slate-900 px-4 text-white hover:bg-slate-700"><MessageSquarePlus className="size-4" /> 新对话</Button><p className="px-2 pb-2 text-[10px] font-bold tracking-[0.16em] text-slate-400">{activeAI?.name ?? "当前 AI"} 的对话</p><nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">{currentConversations.length === 0 && <p className="px-2 py-4 text-sm leading-6 text-slate-400">这个 AI 还没有对话。每个 AI 的记录会分开保存。</p>}{currentConversations.map(conversation => <div key={conversation.id} className={`group rounded-xl ${activeConversationId === conversation.id ? "bg-white shadow-sm" : "hover:bg-white/70"}`}>{renamingId === conversation.id ? <form className="flex gap-1 p-1.5" onSubmit={event => { event.preventDefault(); saveRename(conversation.id); }}><input autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} onBlur={() => setRenamingId(null)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-sky-300" maxLength={120} /><button className="grid size-7 place-items-center rounded-lg bg-[#e1eff8] text-[#3f7698]" aria-label="保存标题"><Check className="size-3.5" /></button></form> : <div className="flex items-center gap-1 p-1.5"><button onClick={() => { setActiveConversationId(conversation.id); setDrawerOpen(false); }} className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm text-slate-700">{conversation.title}</button><div className="hidden items-center gap-0.5 group-hover:flex group-focus-within:flex"><button onClick={() => { setRenamingId(conversation.id); setRenameValue(conversation.title); }} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="重命名会话"><Pencil className="size-3" /></button><button onClick={() => removeConversation(conversation.id)} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label="删除会话"><Trash2 className="size-3" /></button></div></div>}</div>)}</nav><div className="mt-4 border-t border-slate-200 pt-3"><button onClick={() => setLocation("/ais")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-white"><Settings className="size-4 text-slate-400" /> 管理我的 AI <ChevronRight className="ml-auto size-4 text-slate-300" /></button><button onClick={() => setLocation("/profile")} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-white"><span className="grid size-6 place-items-center overflow-hidden rounded-full bg-[#f7dfe7] text-[10px] font-bold text-[#9b5267]">{userProfile.avatar ? <img src={userProfile.avatar} alt="" className="size-full object-cover" /> : userProfile.name.slice(0, 1)}</span><span className="min-w-0 flex-1 truncate">{userProfile.name}</span><UserRound className="size-4 text-slate-400" /></button></div></aside>;

  return <main className="flex h-dvh overflow-hidden bg-[#f3f6f8] text-slate-900"><div className="hidden h-full shrink-0 lg:block">{conversationPanel}</div>{drawerOpen && <div className="fixed inset-0 z-50 lg:hidden"><button onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-slate-900/25" aria-label="关闭会话面板" />{conversationPanel}</div>}<section className="relative flex min-w-0 flex-1 flex-col overflow-hidden"><div className="pointer-events-none absolute -right-16 top-5 size-52 rounded-full bg-[#dceefa]/70 blur-3xl" /><div className="pointer-events-none absolute -bottom-20 left-1/4 size-56 rounded-full bg-[#f7dfe7]/60 blur-3xl" /><header className="relative z-10 flex h-16 shrink-0 items-center justify-between px-4 sm:px-7"><button onClick={() => setDrawerOpen(true)} className="grid size-10 place-items-center rounded-xl bg-white text-slate-600 shadow-sm lg:hidden" aria-label="打开会话面板"><Menu className="size-5" /></button><div className="hidden lg:block"><p className="text-xs font-semibold tracking-[0.16em] text-slate-400">{activeAI?.name ?? "私人 AI"}</p><h1 className="mt-0.5 text-base font-black tracking-tight text-slate-900">{activeConversation?.title ?? "新对话"}</h1></div><div className="ml-auto flex items-center gap-2"><span className={`hidden rounded-full px-3 py-1 text-xs font-medium sm:inline-flex ${isConfigured ? "bg-[#e7f4ed] text-[#39745c]" : "bg-[#fff2e9] text-[#a65b2a]"}`}>{isConfigured ? `${activeAI?.name} 已配置` : "等待配置"}</span><button onClick={() => setLocation("/ais")} className="grid size-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm hover:text-slate-900" aria-label="管理 AI"><Settings className="size-4" /></button><button onClick={() => setLocation("/profile")} className="grid size-10 place-items-center overflow-hidden rounded-xl bg-white text-slate-500 shadow-sm hover:text-slate-900" aria-label="我的资料">{userProfile.avatar ? <img src={userProfile.avatar} alt="" className="size-full object-cover" /> : <UserRound className="size-4" />}</button></div></header><div className="relative z-10 flex min-h-0 flex-1 flex-col px-0 pb-0 sm:px-7 sm:pb-6"><div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-[0_12px_46px_rgba(43,58,72,0.08)] sm:rounded-[1.5rem]"><AIChatBox className="h-full rounded-none border-0 bg-transparent shadow-none" height="100%" messages={messages} onSendMessage={sendMessage} onStop={stopGeneration} isLoading={isStreaming} placeholder={isConfigured ? `向 ${activeAI?.name} 发送消息` : "请先前往管理 AI 配置模型"} emptyStateMessage={isConfigured ? `开始和 ${activeAI?.name} 聊聊` : "先完成当前 AI 的模型设置，再开始对话"} suggestedPrompts={isConfigured ? ["帮我把这段文字表达得更清楚", "今天有什么值得学习的新知识？"] : undefined} assistantName={activeAI?.name} assistantAvatar={activeAI?.avatar} userName={userProfile.name} userAvatar={userProfile.avatar} /></div></div></section></main>;
}
