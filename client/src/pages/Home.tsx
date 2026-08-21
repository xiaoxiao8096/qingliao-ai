import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox, type Message as ChatMessage } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { COOKIE_NAME } from "@shared/const";
import {
  Check,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  LogOut,
  Menu,
  MessageSquarePlus,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type StreamMessage = Pick<ChatMessage, "role" | "content">;

function authHeaders(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem("manus-cookie");
    const prefix = `${COOKIE_NAME}=`;
    const pair = raw?.split(";").find(item => item.trim().startsWith(prefix));
    const token = pair?.trim().slice(prefix.length);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function parseEventBlock(block: string) {
  const event = block.split(/\r?\n/).find(line => line.startsWith("event:"))?.slice(6).trim() ?? "message";
  const data = block
    .split(/\r?\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trimStart())
    .join("\n");
  return data ? { event, payload: JSON.parse(data) as { delta?: string; error?: string } } : null;
}

export default function Home() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [streamMessages, setStreamMessages] = useState<StreamMessage[] | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const conversations = trpc.conversations.list.useQuery();
  const settings = trpc.settings.get.useQuery();
  const activeMessages = trpc.conversations.messages.useQuery(
    { conversationId: activeConversationId ?? "no-active-conversation" },
    { enabled: Boolean(activeConversationId) }
  );
  const createConversation = trpc.conversations.create.useMutation();
  const renameConversation = trpc.conversations.rename.useMutation();
  const deleteConversation = trpc.conversations.delete.useMutation();

  useEffect(() => {
    if (!activeConversationId && conversations.data?.[0]) {
      setActiveConversationId(conversations.data[0].id);
    }
  }, [activeConversationId, conversations.data]);

  useEffect(() => {
    setStreamMessages(null);
  }, [activeConversationId]);

  const messages = useMemo<StreamMessage[]>(() => {
    if (streamMessages) return streamMessages;
    return (activeMessages.data ?? []).map(message => ({ role: message.role, content: message.content }));
  }, [activeMessages.data, streamMessages]);

  const activeConversation = conversations.data?.find(item => item.id === activeConversationId);

  async function startConversation() {
    try {
      const created = await createConversation.mutateAsync();
      if (created) setActiveConversationId(created.id);
      await utils.conversations.list.invalidate();
      setDrawerOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法创建新对话。");
    }
  }

  async function saveRename(id: string) {
    const normalized = renameValue.trim();
    if (!normalized) return;
    try {
      await renameConversation.mutateAsync({ id, title: normalized });
      await utils.conversations.list.invalidate();
      setRenamingId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重命名失败。");
    }
  }

  async function removeConversation(id: string) {
    if (!window.confirm("删除后，该会话与其中的消息将无法恢复。是否继续？")) return;
    try {
      await deleteConversation.mutateAsync({ id });
      const remaining = conversations.data?.filter(item => item.id !== id) ?? [];
      if (activeConversationId === id) setActiveConversationId(remaining[0]?.id ?? null);
      await utils.conversations.list.invalidate();
      setDrawerOpen(false);
      toast.success("会话已删除。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败。");
    }
  }

  async function sendMessage(content: string) {
    if (!settings.data?.apiKeyConfigured) {
      toast.message("请先完成模型设置。", {
        action: { label: "去设置", onClick: () => setLocation("/settings") },
      });
      return;
    }

    let conversationId = activeConversationId;
    if (!conversationId) {
      try {
        const created = await createConversation.mutateAsync();
        if (!created) throw new Error("无法创建会话。");
        conversationId = created.id;
        setActiveConversationId(created.id);
        await utils.conversations.list.invalidate();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "无法创建会话。");
        return;
      }
    }

    const baseMessages = messages;
    setStreamMessages([...baseMessages, { role: "user", content }, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ conversationId, content }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "无法连接模型服务。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split(/\r?\n\r?\n/);
        buffer = chunks.pop() ?? "";
        for (const block of chunks) {
          const parsed = parseEventBlock(block);
          if (!parsed) continue;
          if (parsed.event === "error") streamError = parsed.payload.error ?? "模型生成失败。";
          if (parsed.event === "delta" && parsed.payload.delta) {
            setStreamMessages(previous => {
              if (!previous) return previous;
              const next = [...previous];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + parsed.payload.delta };
              }
              return next;
            });
          }
        }
      }

      if (streamError) throw new Error(streamError);
      await Promise.all([
        utils.conversations.messages.invalidate({ conversationId }),
        utils.conversations.list.invalidate(),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发送失败，请稍后重试。");
      await utils.conversations.messages.invalidate({ conversationId });
    } finally {
      setStreamMessages(null);
      setIsStreaming(false);
    }
  }

  const conversationPanel = (
    <aside className="flex h-full w-[min(85vw,320px)] flex-col bg-[#f8fafb] px-3 pb-4 pt-4 shadow-[12px_0_35px_rgba(36,54,69,0.08)] lg:w-[300px] lg:shadow-none">
      <div className="flex items-center justify-between px-2 pb-5">
        <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-left" aria-label="回到聊天主页">
          <span className="grid size-8 place-items-center rounded-xl bg-[#dceefa] text-[#417698]"><CircleHelp className="size-4" /></span>
          <span><span className="block text-sm font-black tracking-tight text-slate-900">轻聊 AI</span><span className="block text-[10px] font-semibold tracking-[0.16em] text-slate-400">YOUR QUIET SPACE</span></span>
        </button>
        <button onClick={() => setDrawerOpen(false)} className="grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-200 lg:hidden" aria-label="关闭会话面板"><X className="size-4" /></button>
      </div>

      <Button onClick={startConversation} disabled={createConversation.isPending} className="mb-5 h-11 justify-start gap-2 rounded-xl bg-slate-900 px-4 text-white hover:bg-slate-700">
        <MessageSquarePlus className="size-4" /> 新对话
      </Button>

      <p className="px-2 pb-2 text-[10px] font-bold tracking-[0.16em] text-slate-400">最近对话</p>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {conversations.isLoading && <p className="px-2 py-4 text-sm text-slate-400">正在读取会话…</p>}
        {!conversations.isLoading && conversations.data?.length === 0 && <p className="px-2 py-4 text-sm leading-6 text-slate-400">从一段新对话开始吧。</p>}
        {conversations.data?.map(conversation => (
          <div key={conversation.id} className={`group rounded-xl ${activeConversationId === conversation.id ? "bg-white shadow-sm" : "hover:bg-white/70"}`}>
            {renamingId === conversation.id ? (
              <form className="flex gap-1 p-1.5" onSubmit={event => { event.preventDefault(); void saveRename(conversation.id); }}>
                <input autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} onBlur={() => setRenamingId(null)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-sky-300" maxLength={120} />
                <button className="grid size-7 place-items-center rounded-lg bg-[#e1eff8] text-[#3f7698]" aria-label="保存标题"><Check className="size-3.5" /></button>
              </form>
            ) : (
              <div className="flex items-center gap-1 p-1.5">
                <button onClick={() => { setActiveConversationId(conversation.id); setDrawerOpen(false); }} className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm text-slate-700">{conversation.title}</button>
                <div className="hidden items-center gap-0.5 group-hover:flex group-focus-within:flex">
                  <button onClick={() => { setRenamingId(conversation.id); setRenameValue(conversation.title); }} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="重命名会话"><Pencil className="size-3" /></button>
                  <button onClick={() => void removeConversation(conversation.id)} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label="删除会话"><Trash2 className="size-3" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <button onClick={() => setLocation("/settings")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-white">
          <Settings className="size-4 text-slate-400" /> 模型设置 <ChevronRight className="ml-auto size-4 text-slate-300" />
        </button>
        {user?.role === "admin" && <button onClick={() => setLocation("/admin/users")} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-white"><ShieldCheck className="size-4 text-slate-400" /> 用户管理 <ChevronRight className="ml-auto size-4 text-slate-300" /></button>}
        <div className="mt-2 flex items-center gap-3 px-3 py-2">
          <span className="grid size-8 place-items-center rounded-full bg-[#f7dfe7] text-xs font-bold text-[#9b5267]">{user?.name?.slice(0, 1).toUpperCase() ?? "U"}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-700">{user?.name || "已登录用户"}</span><span className="block truncate text-[11px] text-slate-400">{user?.email || "Manus 账户"}</span></span>
          <button onClick={logout} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label="退出登录"><LogOut className="size-4" /></button>
        </div>
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
          <div className="hidden lg:block"><p className="text-xs font-semibold tracking-[0.16em] text-slate-400">对话空间</p><h1 className="mt-0.5 text-base font-black tracking-tight text-slate-900">{activeConversation?.title ?? "新对话"}</h1></div>
          <div className="ml-auto flex items-center gap-2"><span className={`hidden rounded-full px-3 py-1 text-xs font-medium sm:inline-flex ${settings.data?.apiKeyConfigured ? "bg-[#e7f4ed] text-[#39745c]" : "bg-[#fff2e9] text-[#a65b2a]"}`}>{settings.data?.apiKeyConfigured ? "模型已连接" : "等待配置"}</span><button onClick={() => setLocation("/settings")} className="grid size-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm hover:text-slate-900" aria-label="模型设置"><Settings className="size-4" /></button></div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-0 pb-0 sm:px-7 sm:pb-6">
          <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-[0_12px_46px_rgba(43,58,72,0.08)] sm:rounded-[1.5rem]">
            <AIChatBox
              className="h-full rounded-none border-0 bg-transparent shadow-none"
              height="100%"
              messages={messages}
              onSendMessage={sendMessage}
              isLoading={isStreaming}
              placeholder={settings.data?.apiKeyConfigured ? "输入消息，Enter 发送" : "请先前往设置配置模型"}
              emptyStateMessage={settings.data?.apiKeyConfigured ? "从一个问题，开启轻聊" : "先完成模型设置，再开始对话"}
              suggestedPrompts={settings.data?.apiKeyConfigured ? ["帮我把这段文字表达得更清楚", "今天有什么值得学习的新知识？"] : undefined}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
