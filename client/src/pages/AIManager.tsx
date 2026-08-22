import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { checkModelConnection } from "@/lib/localChat";
import {
  createAIProfile,
  getAIProfiles,
  getActiveAIId,
  imageFileToDataUrl,
  saveAIProfiles,
  setActiveAIId,
  type LocalAIProfile,
} from "@/lib/localProfiles";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  Wifi,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "AI";
}

function validateBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("请填写 HTTPS API 地址。");
  return url.toString().replace(/\/$/, "");
}

export default function AIManager() {
  const [, setLocation] = useLocation();
  const [profiles, setProfiles] = useState<LocalAIProfile[]>(() => getAIProfiles());
  const [activeId, setActiveId] = useState(() => getActiveAIId());
  const [editingId, setEditingId] = useState(() => getActiveAIId());
  const [showKey, setShowKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const current = profiles.find(profile => profile.id === editingId) ?? profiles[0];
  const [form, setForm] = useState<LocalAIProfile>(() => current);

  useEffect(() => {
    const selected = profiles.find(profile => profile.id === editingId) ?? profiles[0];
    if (selected) setForm(selected);
  }, [editingId, profiles]);

  function persist(next: LocalAIProfile[]) {
    setProfiles(next);
    saveAIProfiles(next);
  }

  function addProfile() {
    const profile = createAIProfile();
    persist([...profiles, profile]);
    setEditingId(profile.id);
    toast.success("已新增一个 AI 档案。");
  }

  function deleteProfile(id: string) {
    if (profiles.length <= 1) {
      toast.error("请至少保留一个 AI 档案。");
      return;
    }
    if (!window.confirm("删除这个 AI 档案后，其专属会话仍会保留在本机，但不能再继续调用该 AI。是否继续？")) return;
    const next = profiles.filter(profile => profile.id !== id);
    persist(next);
    if (activeId === id) {
      setActiveAIId(next[0].id);
      setActiveId(next[0].id);
    }
    setEditingId(next[0].id);
  }

  async function onAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const avatar = await imageFileToDataUrl(file);
      setForm(previous => ({ ...previous, avatar }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "头像处理失败。");
    } finally {
      event.target.value = "";
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!form.name.trim()) throw new Error("请给这个 AI 起一个名字。");
      if (!form.model.trim() || !form.apiKey.trim()) throw new Error("请填写模型名称和 API Key。");
      const saved: LocalAIProfile = {
        ...form,
        name: form.name.trim(),
        model: form.model.trim(),
        apiKey: form.apiKey.trim(),
        baseUrl: validateBaseUrl(form.baseUrl),
        updatedAt: Date.now(),
      };
      persist(profiles.map(profile => profile.id === saved.id ? saved : profile));
      if (!activeId) {
        setActiveAIId(saved.id);
        setActiveId(saved.id);
      }
      toast.success(`${saved.name} 已保存在当前浏览器。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    }
  }

  async function testConnection() {
    if (!form.baseUrl.trim() || !form.apiKey.trim()) {
      toast.error("请先填写 API Base URL 和 API Key。");
      return;
    }

    try {
      validateBaseUrl(form.baseUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "请检查 API 地址。");
      return;
    }

    setTestingConnection(true);
    const result = await checkModelConnection(form.baseUrl, form.apiKey);
    setTestingConnection(false);
    if (result.ok) {
      toast.success("连接正常：服务已接受当前 API Key。", { description: result.endpoint });
    } else {
      toast.error(result.message, { description: result.endpoint });
    }
  }

  function useAI(id: string) {
    setActiveAIId(id);
    setActiveId(id);
    toast.success("已切换当前聊天 AI。");
  }

  if (!current) return null;

  return (
    <main className="min-h-dvh bg-[#f3f6f8] px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:text-slate-900"><ArrowLeft className="size-4" /> 返回对话</button>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[#dceefa] text-[#3f7698]"><Settings2 className="size-5" /></div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-[1.5rem] bg-white p-4 shadow-[0_16px_55px_rgba(43,58,72,0.08)]">
            <div className="mb-4 flex items-center justify-between px-1">
              <div><p className="text-xs font-bold tracking-[0.15em] text-slate-400">MY AI</p><h1 className="mt-1 text-xl font-black tracking-tight text-slate-900">我的 AI</h1></div>
              <button onClick={addProfile} className="grid size-9 place-items-center rounded-xl bg-slate-900 text-white" aria-label="新增 AI"><Plus className="size-4" /></button>
            </div>
            <div className="space-y-1">
              {profiles.map(profile => (
                <div key={profile.id} className={`flex items-center gap-2 rounded-xl p-2 ${editingId === profile.id ? "bg-[#edf6fb]" : "hover:bg-slate-50"}`}>
                  <button onClick={() => setEditingId(profile.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#dceefa] text-xs font-bold text-[#3f7698]">{profile.avatar ? <img src={profile.avatar} alt="" className="size-full object-cover" /> : initials(profile.name)}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-700">{profile.name}</span><span className="block text-[11px] text-slate-400">{profile.id === activeId ? "当前使用中" : profile.model || "未配置"}</span></span>
                  </button>
                  <button onClick={() => useAI(profile.id)} className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${profile.id === activeId ? "bg-white text-[#39745c] shadow-sm" : "text-slate-400 hover:bg-white"}`}>{profile.id === activeId ? "正在用" : "使用"}</button>
                </div>
              ))}
            </div>
            <Button onClick={addProfile} variant="outline" className="mt-4 h-10 w-full rounded-xl border-dashed text-slate-600"><Plus className="mr-2 size-4" />新增 AI</Button>
          </aside>

          <section className="rounded-[1.75rem] bg-white p-5 shadow-[0_16px_55px_rgba(43,58,72,0.08)] sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold tracking-[0.15em] text-slate-400">AI PROFILE</p><h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">编辑 AI 档案</h2><p className="mt-2 text-sm leading-6 text-slate-500">每个 AI 都有自己的名称、头像与模型 API。所有数据仅保存在 Safari 本机。</p></div>
              <button onClick={() => deleteProfile(form.id)} className="grid size-10 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label="删除 AI"><Trash2 className="size-4" /></button>
            </div>

            <form onSubmit={submit} className="mt-7 space-y-5">
              <div className="flex items-center gap-4">
                <input ref={avatarInput} onChange={onAvatarChange} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" />
                <button type="button" onClick={() => avatarInput.current?.click()} className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#f7dfe7] text-base font-bold text-[#9b5267]">{form.avatar ? <img src={form.avatar} alt="AI 头像" className="size-full object-cover" /> : initials(form.name)}</button>
                <div><p className="font-semibold text-slate-700">AI 头像</p><button type="button" onClick={() => avatarInput.current?.click()} className="mt-1 inline-flex items-center gap-1 text-sm text-[#4a86a8]"><ImagePlus className="size-3.5" />更换图片</button></div>
              </div>

              <div className="space-y-2"><Label htmlFor="ai-name">AI 名称</Label><Input id="ai-name" value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} placeholder="例如 工作助手" className="h-11 rounded-xl border-slate-200 bg-slate-50/60" required /></div>
              <div className="space-y-2"><Label htmlFor="ai-url">API Base URL</Label><Input id="ai-url" value={form.baseUrl} onChange={event => setForm(previous => ({ ...previous, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" className="h-11 rounded-xl border-slate-200 bg-slate-50/60" required /></div>
              <div className="space-y-2"><Label htmlFor="ai-model">模型名称</Label><Input id="ai-model" value={form.model} onChange={event => setForm(previous => ({ ...previous, model: event.target.value }))} placeholder="例如 gpt-4o-mini" className="h-11 rounded-xl border-slate-200 bg-slate-50/60" required /></div>
              <div className="space-y-2">
                <Label htmlFor="ai-key">API Key</Label>
                <div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="ai-key" type={showKey ? "text" : "password"} value={form.apiKey} onChange={event => setForm(previous => ({ ...previous, apiKey: event.target.value }))} placeholder="sk-..." className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pl-10 pr-11" autoComplete="off" required /><button type="button" onClick={() => setShowKey(value => !value)} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}>{showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-persona">人物设定（可选）</Label>
                <Textarea id="ai-persona" value={form.persona} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setForm(previous => ({ ...previous, persona: event.target.value }))} placeholder="例如：你是一位严谨的工程师，回答时先给结论再展开。" className="min-h-24 rounded-xl border-slate-200 bg-slate-50/60" />
              </div>

              <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-3.5">
                <div className="flex gap-3"><Wifi className="mt-0.5 size-4 shrink-0 text-[#4a86a8]" /><div><p className="text-sm font-semibold text-slate-700">先检查连接</p><p className="mt-0.5 text-xs leading-5 text-slate-500">仅请求模型服务的 <code>/models</code>，不会发送聊天内容。可帮助发现地址、跨域或授权问题。</p></div></div>
                <Button type="button" onClick={testConnection} disabled={testingConnection} variant="outline" className="mt-3 h-10 w-full rounded-xl border-sky-200 bg-white text-[#397499] hover:bg-sky-50">
                  {testingConnection ? <><Loader2 className="mr-2 size-4 animate-spin" />正在检查</> : <><Wifi className="mr-2 size-4" />测试 API 连接</>}
                </Button>
              </div>

              <Button type="submit" className="h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-700"><CheckCircle2 className="mr-2 size-4" />保存 {form.name || "AI"}</Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
