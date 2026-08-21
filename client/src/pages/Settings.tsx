import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings, saveSettings } from "@/lib/localChat";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function validateBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("请填写 HTTPS API 地址。");
  return url.toString().replace(/\/$/, "");
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const saved = getSettings();
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl);
  const [model, setModel] = useState(saved.model);
  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [showKey, setShowKey] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const normalized = validateBaseUrl(baseUrl);
      if (!model.trim() || !apiKey.trim()) throw new Error("请完整填写模型名称和 API Key。");
      saveSettings({ baseUrl: normalized, model: model.trim(), apiKey: apiKey.trim() });
      setBaseUrl(normalized);
      toast.success("模型配置已保存在当前浏览器。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败，请检查填写内容。");
    }
  }

  return <main className="min-h-dvh bg-[#f3f6f8] px-4 py-5 sm:px-8 sm:py-8"><div className="mx-auto max-w-2xl"><header className="mb-7 flex items-center justify-between"><button onClick={() => setLocation("/")} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:text-slate-900"><ArrowLeft className="size-4" /> 返回对话</button><div className="flex size-10 items-center justify-center rounded-2xl bg-[#dceefa] text-[#3f7698]"><SlidersHorizontal className="size-5" /></div></header><section className="rounded-[1.75rem] bg-white p-5 shadow-[0_16px_55px_rgba(43,58,72,0.08)] sm:p-9"><p className="text-xs font-bold tracking-[0.16em] text-slate-400">MY MODEL · LOCAL ONLY</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">模型设置</h1><p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">将你自己的兼容 OpenAI Chat Completions 的模型服务接入轻聊。所有配置仅存在当前浏览器，不会上传到服务器。</p><div className="mt-7 flex gap-3 rounded-2xl bg-[#f5f9fb] p-4 text-sm text-slate-600"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#4a86a8]" /><p><strong className="font-semibold text-slate-800">这是个人本机模式。</strong><br />API Key 和聊天记录保存在本机浏览器；换设备、清理浏览器数据或使用无痕模式后不会保留。模型服务还必须允许浏览器跨域访问。</p></div><form onSubmit={handleSubmit} className="mt-8 space-y-6"><div className="space-y-2"><Label htmlFor="base-url">API Base URL</Label><Input id="base-url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" className="h-11 rounded-xl border-slate-200 bg-slate-50/60" required /></div><div className="space-y-2"><Label htmlFor="model">模型名称</Label><Input id="model" value={model} onChange={event => setModel(event.target.value)} placeholder="例如 gpt-4o-mini" className="h-11 rounded-xl border-slate-200 bg-slate-50/60" required /></div><div className="space-y-2"><Label htmlFor="api-key">API Key</Label><div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="api-key" type={showKey ? "text" : "password"} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="sk-..." className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pl-10 pr-11" autoComplete="off" required /><button type="button" onClick={() => setShowKey(value => !value)} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}>{showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div><Button type="submit" className="h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-700"><CheckCircle2 className="mr-2 size-4" />保存到此浏览器</Button></form></section></div></main>;
}
