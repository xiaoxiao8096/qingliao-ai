import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Settings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const settings = trpc.settings.get.useQuery();
  const saveSettings = trpc.settings.save.useMutation();
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setBaseUrl(settings.data.baseUrl);
      setModel(settings.data.model);
    }
  }, [settings.data]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings.data?.apiKeyConfigured && !apiKey.trim()) {
      toast.error("首次保存时需要填写 API Key。");
      return;
    }
    try {
      await saveSettings.mutateAsync({ baseUrl, model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
      setApiKey("");
      await utils.settings.get.invalidate();
      toast.success("模型配置已安全保存。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败，请检查填写内容。");
    }
  }

  return (
    <main className="min-h-dvh bg-[#f3f6f8] px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-7 flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:text-slate-900"><ArrowLeft className="size-4" /> 返回对话</button>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[#dceefa] text-[#3f7698]"><SlidersHorizontal className="size-5" /></div>
        </header>

        <section className="rounded-[1.75rem] bg-white p-5 shadow-[0_16px_55px_rgba(43,58,72,0.08)] sm:p-9">
          <p className="text-xs font-bold tracking-[0.16em] text-slate-400">MY MODEL</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">模型设置</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">将你自己的兼容 OpenAI Chat Completions 的模型服务接入轻聊。API Key 会经服务器加密后保存，界面不会再次展示原始密钥。</p>

          <div className="mt-7 flex gap-3 rounded-2xl bg-[#f5f9fb] p-4 text-sm text-slate-600"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#4a86a8]" /><p><strong className="font-semibold text-slate-800">你的配置仅供你的账户使用。</strong><br />聊天请求由服务器代发，浏览器不会获得已保存的密钥。</p></div>

          <form onSubmit={event => void handleSubmit(event)} className="mt-8 space-y-6">
            <div className="space-y-2"><Label htmlFor="base-url">API Base URL</Label><Input id="base-url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" className="h-11 rounded-xl border-slate-200 bg-slate-50/60" required /></div>
            <div className="space-y-2"><Label htmlFor="model">模型名称</Label><Input id="model" value={model} onChange={event => setModel(event.target.value)} placeholder="例如 gpt-4o-mini" className="h-11 rounded-xl border-slate-200 bg-slate-50/60" required /></div>
            <div className="space-y-2"><Label htmlFor="api-key">API Key {settings.data?.apiKeyConfigured && <span className="ml-1 font-normal text-slate-400">（留空则保留当前密钥）</span>}</Label><div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="api-key" type={showKey ? "text" : "password"} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={settings.data?.apiKeyConfigured ? "已安全保存" : "sk-..."} className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pl-10 pr-11" autoComplete="new-password" /><button type="button" onClick={() => setShowKey(value => !value)} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}>{showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
            <Button type="submit" disabled={saveSettings.isPending || settings.isLoading} className="h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-700">{saveSettings.isPending ? <><Loader2 className="mr-2 size-4 animate-spin" />正在保存</> : <><CheckCircle2 className="mr-2 size-4" />保存模型配置</>}</Button>
          </form>
        </section>

        <section className="mt-5 flex items-center gap-3 rounded-2xl bg-white/70 p-4 text-sm text-slate-500"><span className="grid size-9 place-items-center rounded-full bg-[#f7dfe7] font-bold text-[#9b5267]">{user?.name?.slice(0, 1).toUpperCase() || "U"}</span><span>当前账户：<strong className="font-medium text-slate-700">{user?.name || "已登录用户"}</strong></span></section>
      </div>
    </main>
  );
}
