import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cancelRemoteVideoTask, generateAndStoreDocument, generateAndStoreMedia, type MediaCapability, type VideoTaskUpdate } from "@/lib/localMedia";
import { getActiveAIId, getAIProfiles, type LocalAIProfile } from "@/lib/localProfiles";
import { ArrowLeft, AudioLines, BookOpen, FileCode2, Film, Image as ImageIcon, Loader2, Music2, Settings2, Sparkles, Video } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const creators: Array<{ capability: MediaCapability; label: string; note: string; icon: typeof FileCode2 }> = [
  { capability: "document", label: "文档", note: "Markdown、HTML 或纯文本", icon: FileCode2 },
  { capability: "image", label: "图片", note: "使用图片生成端点", icon: ImageIcon },
  { capability: "speech", label: "语音", note: "将文本合成为音频", icon: AudioLines },
  { capability: "music", label: "音乐", note: "使用音乐生成端点", icon: Music2 },
  { capability: "video", label: "视频", note: "使用视频生成端点", icon: Video },
];

export default function Studio() {
  const [, setLocation] = useLocation();
  const [profiles] = useState<LocalAIProfile[]>(() => getAIProfiles());
  const [activeAIId] = useState(() => getActiveAIId());
  const [capability, setCapability] = useState<MediaCapability>("document");
  const [documentFormat, setDocumentFormat] = useState<"markdown" | "html" | "text">("markdown");
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [videoTask, setVideoTask] = useState<VideoTaskUpdate | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeAI = useMemo(() => profiles.find(profile => profile.id === activeAIId) ?? profiles[0], [activeAIId, profiles]);

  const create = async () => {
    const content = prompt.trim();
    if (!content) { toast.error("请先描述你要创作的内容。"); return; }
    if (!activeAI) { toast.error("请先创建并配置一个 AI 档案。"); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    if (capability === "video") setVideoTask({ stage: "submitting", progress: 8, message: "正在创建视频任务" });
    setCreating(true);
    try {
      const asset = capability === "document"
        ? await generateAndStoreDocument(activeAI, content, documentFormat)
        : await generateAndStoreMedia(activeAI, capability, content, { signal: controller.signal, onVideoTaskUpdate: setVideoTask });
      toast.success("创作结果已保存到本机素材库。", { description: `${asset.name} · ${asset.category}` });
      setLocation("/library");
    } catch (error) {
      if (controller.signal.aborted) toast.message("已停止本机等待视频任务。", { description: "若服务商不支持取消端点，远端任务可能仍继续执行。" });
      else toast.error(error instanceof Error ? error.message : "创作失败，请检查当前 AI 的端点配置。");
    } finally { if (abortRef.current === controller) abortRef.current = null; setCreating(false); }
  };

  const cancelVideo = async () => {
    if (!activeAI || !creating || capability !== "video") return;
    const taskId = videoTask?.taskId;
    setVideoTask(previous => previous ? { ...previous, stage: "cancelled", message: "正在停止本机等待…" } : previous);
    try {
      const remoteCancelled = taskId ? await cancelRemoteVideoTask(activeAI, taskId) : false;
      abortRef.current?.abort();
      setVideoTask(previous => previous ? { ...previous, stage: "cancelled", progress: 0, message: remoteCancelled ? "已向服务商发送取消请求" : "已停止本机等待；服务商任务可能仍继续" } : previous);
    } catch (error) {
      abortRef.current?.abort();
      toast.error(error instanceof Error ? error.message : "取消视频任务失败，已停止本机等待。");
    }
  };

  return <main className="min-h-dvh bg-[radial-gradient(circle_at_85%_5%,#dceefa_0,transparent_24rem),#f6f8fb] px-4 py-5 sm:px-7 sm:py-8"><div className="mx-auto max-w-4xl"><header className="flex items-center justify-between gap-3"><button type="button" onClick={() => setLocation("/library")} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:text-slate-900"><ArrowLeft className="size-4" />素材库</button><button type="button" onClick={() => setLocation("/ais")} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:text-slate-900"><Settings2 className="size-4" />端点设置</button></header>
    <section className="mt-7 rounded-[2rem] bg-white p-5 shadow-[0_18px_55px_rgba(43,58,72,.10)] sm:p-8"><div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-slate-900 text-white shadow-lg"><Sparkles className="size-5" /></span><div><p className="text-xs font-bold tracking-[0.16em] text-slate-400">CREATE LOCALLY</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">创作中心</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">生成请求会从当前浏览器直连当前 AI 配置的兼容端点；成功返回的文件会直接保存到本机素材库，不会经过轻聊服务器。</p></div></div>
      <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-5">{creators.map(item => { const Icon = item.icon; const active = item.capability === capability; return <button type="button" key={item.capability} onClick={() => setCapability(item.capability)} className={`rounded-2xl border p-3 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white shadow-md" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`} aria-pressed={active}><Icon className="size-4" /><span className="mt-3 block text-sm font-bold">{item.label}</span><span className={`mt-1 block text-[10px] leading-4 ${active ? "text-slate-300" : "text-slate-400"}`}>{item.note}</span></button>; })}</div>
      <div className="mt-6 rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-slate-700">使用的 AI：{activeAI?.name ?? "未选择"}</p><p className="mt-1 text-xs text-slate-500">{activeAI?.model ? `文本模型：${activeAI.model}` : "尚未配置文本模型"}</p></div><button type="button" onClick={() => setLocation("/ais")} className="text-xs font-semibold text-sky-700 hover:underline">调整端点</button></div>{capability === "document" && <div className="mt-4 flex gap-2">{(["markdown", "html", "text"] as const).map(format => <button type="button" key={format} onClick={() => setDocumentFormat(format)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${documentFormat === format ? "bg-sky-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"}`}>{format === "markdown" ? "Markdown" : format === "html" ? "HTML" : "纯文本"}</button>)}</div>}<Textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={capability === "document" ? "例如：写一份关于个人知识库使用方法的简洁说明，包含标题、步骤和注意事项。" : capability === "speech" ? "输入需要合成的旁白文本…" : `描述你想生成的${creators.find(item => item.capability === capability)?.label ?? "内容"}…`} className="mt-4 min-h-44 rounded-xl border-slate-200 bg-white text-sm leading-6" maxLength={8000} /><p className="mt-2 text-right text-[11px] text-slate-400">{prompt.length}/8000</p></div>
      <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><p className="font-bold">兼容性提示</p><p className="mt-1">图片与语音支持常见 OpenAI 兼容请求；视频默认支持“创建任务 → 查询进度 → 下载成品”的异步路径。音乐及其他服务商格式可在“端点设置”的高级参数中填写 JSON 模板、结果字段、轮询和下载路径。若上游未开放 HTTPS/CORS 或返回格式不匹配，轻聊会给出明确错误而不会伪造成功。</p></div>
      {capability === "music" && activeAI?.media?.music?.providerTemplateId === "music-gmi-minimax-3" && <div className="mt-5 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs leading-5 text-rose-800"><p className="font-bold">GMI Cloud 直连限制</p><p className="mt-1">官方 console 音乐端点当前不允许浏览器携带 API Key 跨域调用，因此纯静态轻聊不能直接请求。请在端点设置中将地址改为你自己控制、允许 CORS 的 HTTPS 代理；不要使用公共 CORS 代理。</p></div>}
      {capability === "video" && videoTask && <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50 p-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-sky-800">{videoTask.message}</span><span className="shrink-0 text-sky-600">{videoTask.progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-sky-600 transition-[width] duration-300" style={{ width: `${videoTask.progress}%` }} /></div>{videoTask.taskId && <p className="mt-2 truncate text-[10px] text-sky-600">任务 ID：{videoTask.taskId}</p>}</div>}
      <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]"><Button type="button" onClick={() => void create()} disabled={creating || !activeAI} className="h-12 rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60">{creating ? <><Loader2 className="mr-2 size-4 animate-spin" />正在创作并保存到本机…</> : <><Sparkles className="mr-2 size-4" />生成并保存到本机素材库</>}</Button>{capability === "video" && creating && <Button type="button" onClick={() => void cancelVideo()} variant="outline" className="h-12 rounded-xl border-rose-200 bg-white text-rose-600 hover:bg-rose-50">停止等待</Button>}</div>
    </section></div></main>;
}
