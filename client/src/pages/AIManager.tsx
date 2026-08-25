import { Button } from "@/components/ui/button";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { checkModelConnection, checkSelectedModel, fetchAvailableModels } from "@/lib/localChat";
import {
  createAppearancePreset,
  createAIProfile,
  DEFAULT_AI_APPEARANCE,
  getAIProfiles,
  getAppearancePresets,
  getActiveAIId,
  imageFileToDataUrl,
  saveAppearancePresets,
  saveAIProfiles,
  setActiveAIId,
  type AIAppearance,
  type AppearancePreset,
  type LocalAIProfile,
} from "@/lib/localProfiles";
import {
  ArrowLeft,
  BookmarkPlus,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  KeyRound,
  Loader2,
  Palette,
  Plus,
  Settings2,
  Trash2,
  Type,
  Wifi,
  X,
} from "lucide-react";
import { ChangeEvent, FormEvent, type CSSProperties, useEffect, useRef, useState } from "react";
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

const accentOptions: { value: AIAppearance["accent"]; label: string; className: string }[] = [
  { value: "sky", label: "天空", className: "bg-sky-400" },
  { value: "violet", label: "紫罗兰", className: "bg-violet-400" },
  { value: "rose", label: "玫瑰", className: "bg-rose-400" },
  { value: "emerald", label: "翡翠", className: "bg-emerald-400" },
  { value: "amber", label: "琥珀", className: "bg-amber-400" },
];

const fontScaleOptions: { value: AIAppearance["fontScale"]; label: string }[] = [
  { value: "small", label: "小" },
  { value: "medium", label: "标准" },
  { value: "large", label: "大" },
];

const radiusOptions: { value: AIAppearance["bubbleRadius"]; label: string }[] = [
  { value: "soft", label: "柔和" },
  { value: "rounded", label: "圆润" },
  { value: "pill", label: "胶囊" },
];

const textureOptions: { value: AIAppearance["chatTexture"]; label: string }[] = [
  { value: "plain", label: "纯色" },
  { value: "dots", label: "圆点" },
  { value: "grid", label: "网格" },
  { value: "paper", label: "纸张" },
];

const previewPalette: Record<AIAppearance["accent"], { primary: string; soft: string }> = {
  sky: { primary: "#16698e", soft: "#e4f3fb" },
  violet: { primary: "#6844ad", soft: "#efe9ff" },
  rose: { primary: "#a94d63", soft: "#fbe9ee" },
  emerald: { primary: "#277a5f", soft: "#e4f5ed" },
  amber: { primary: "#95621a", soft: "#fff3d9" },
};

function appearanceOf(value?: Partial<AIAppearance>): AIAppearance {
  return { ...DEFAULT_AI_APPEARANCE, ...value };
}

function previewTexture(appearance: AIAppearance): CSSProperties {
  const tint = previewPalette[appearance.accent].primary;
  if (appearance.chatTexture === "dots") return { backgroundColor: "#fbfcfd", backgroundImage: "radial-gradient(rgba(100,116,139,.20) 1px, transparent 1px)", backgroundSize: "16px 16px" };
  if (appearance.chatTexture === "grid") return { backgroundColor: "#fbfcfd", backgroundImage: "linear-gradient(rgba(100,116,139,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,.15) 1px, transparent 1px)", backgroundSize: "20px 20px" };
  if (appearance.chatTexture === "paper") return { backgroundColor: "#fffefd", backgroundImage: `linear-gradient(115deg, ${tint}18, transparent 45%), repeating-linear-gradient(0deg, transparent, transparent 26px, rgba(100,116,139,.12) 27px)` };
  return { backgroundColor: "#fbfcfd" };
}

function previewRadius(value: AIAppearance["bubbleRadius"]) {
  return value === "soft" ? "0.7rem" : value === "pill" ? "1.8rem" : "1.25rem";
}

function previewFontSize(value: AIAppearance["fontScale"]) {
  return value === "small" ? "12px" : value === "large" ? "16px" : "14px";
}

function SortablePresetItem({ preset, summary, onApply, onRemove }: { preset: AppearancePreset; summary: string; onApply: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: preset.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-1 rounded-xl border border-white bg-white/80 p-1 ${isDragging ? "z-10 opacity-70 shadow-lg" : ""}`}>
      <button type="button" className="grid size-8 shrink-0 touch-none place-items-center rounded-lg text-slate-400 hover:bg-violet-50 hover:text-violet-600" aria-label={`拖动排序主题预设 ${preset.name}`} {...attributes} {...listeners}><GripVertical className="size-4" /></button>
      <button type="button" onClick={onApply} className="min-w-0 flex-1 rounded-lg px-1 py-1.5 text-left text-xs text-slate-600 hover:bg-violet-50"><span className="block truncate font-semibold text-slate-700">{preset.name}</span><span className="block truncate text-[10px] text-slate-400">{summary}</span></button>
      <button type="button" onClick={onRemove} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`删除主题预设 ${preset.name}`}><X className="size-3.5" /></button>
    </div>
  );
}

export default function AIManager() {
  const [, setLocation] = useLocation();
  const [profiles, setProfiles] = useState<LocalAIProfile[]>(() => getAIProfiles());
  const [activeId, setActiveId] = useState(() => getActiveAIId());
  const [editingId, setEditingId] = useState(() => getActiveAIId());
  const [showKey, setShowKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testingSelectedModel, setTestingSelectedModel] = useState(false);
  const [modelFeedback, setModelFeedback] = useState<{ kind: "loading" | "error" | "success"; text: string } | null>(null);
  const [modelTestFeedback, setModelTestFeedback] = useState<{ kind: "loading" | "error" | "success"; text: string } | null>(null);
  const [presets, setPresets] = useState<AppearancePreset[]>(() => getAppearancePresets());
  const [presetName, setPresetName] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const current = profiles.find(profile => profile.id === editingId) ?? profiles[0];
  const [form, setForm] = useState<LocalAIProfile>(() => current);
  const appearance = appearanceOf(form.appearance);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    const selected = profiles.find(profile => profile.id === editingId) ?? profiles[0];
    if (selected) {
      setForm(selected);
      setAvailableModels([]);
      setModelFeedback(null);
      setModelTestFeedback(null);
    }
  }, [editingId, profiles]);

  function persist(next: LocalAIProfile[]) {
    setProfiles(next);
    saveAIProfiles(next);
  }

  function saveAppearance(patch: Partial<AIAppearance>) {
    const appearance = appearanceOf({ ...form.appearance, ...patch });
    const updatedAt = Date.now();
    setForm(previous => ({ ...previous, appearance, updatedAt }));
    persist(profiles.map(profile => profile.id === form.id ? { ...profile, appearance, updatedAt } : profile));
  }

  function saveWelcome() {
    const welcome = (form.welcome ?? "").trim().slice(0, 180);
    const updatedAt = Date.now();
    setForm(previous => ({ ...previous, welcome, updatedAt }));
    persist(profiles.map(profile => profile.id === form.id ? { ...profile, welcome, updatedAt } : profile));
    toast.success(welcome ? "专属欢迎语已保存。" : "已清空专属欢迎语。");
  }

  function persistPresets(next: AppearancePreset[]) {
    setPresets(next);
    saveAppearancePresets(next);
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) {
      toast.error("请先为这个主题预设取个名字。");
      return;
    }
    if (presets.length >= 20) {
      toast.error("最多可保存 20 个主题预设，请先删除不常用的预设。");
      return;
    }
    const preset = createAppearancePreset(name, appearance);
    persistPresets([preset, ...presets]);
    setPresetName("");
    toast.success(`已保存主题预设「${preset.name}」。`);
  }

  function applyPreset(preset: AppearancePreset) {
    saveAppearance(preset.appearance);
    toast.success(`已将「${preset.name}」应用到 ${form.name || "当前 AI"}。`);
  }

  function removePreset(id: string) {
    persistPresets(presets.filter(preset => preset.id !== id));
  }

  function reorderPresets(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = presets.findIndex(preset => preset.id === active.id);
    const newIndex = presets.findIndex(preset => preset.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    persistPresets(arrayMove(presets, oldIndex, newIndex));
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
        welcome: form.welcome?.trim().slice(0, 180) ?? "",
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

  async function loadModels() {
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

    setLoadingModels(true);
    setModelFeedback({ kind: "loading", text: "正在请求 /models 并整理可选模型…" });
    const result = await fetchAvailableModels(form.baseUrl, form.apiKey);
    setLoadingModels(false);
    if (result.ok) {
      setAvailableModels(result.models);
      setModelFeedback({ kind: "success", text: `已获取 ${result.models.length} 个可用模型，请选择一个。` });
      toast.success(`已获取 ${result.models.length} 个可用模型。`, { description: "请选择一个模型；也可保留手动填写。" });
    } else {
      setAvailableModels([]);
      setModelFeedback({ kind: "error", text: result.message });
      toast.error(result.message, { description: result.endpoint });
    }
  }

  async function testCurrentModel() {
    if (!form.baseUrl.trim() || !form.apiKey.trim() || !form.model.trim()) {
      toast.error("请先填写 API Base URL、API Key 并选择一个模型。");
      return;
    }
    try {
      validateBaseUrl(form.baseUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "请检查 API 地址。");
      return;
    }

    setTestingSelectedModel(true);
    setModelTestFeedback({ kind: "loading", text: `正在测试「${form.model.trim()}」…` });
    const result = await checkSelectedModel(form.baseUrl, form.apiKey, form.model);
    setTestingSelectedModel(false);
    if (result.ok) {
      setModelTestFeedback({ kind: "success", text: `「${form.model.trim()}」可用，可以保存。` });
      toast.success(`「${form.model.trim()}」可用，可以保存。`, { description: "已完成一次最小化连接测试。" });
    } else {
      setModelTestFeedback({ kind: "error", text: result.message });
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
              <div className="space-y-2"><Label htmlFor="ai-url">API Base URL</Label><Input id="ai-url" value={form.baseUrl} onChange={event => { setForm(previous => ({ ...previous, baseUrl: event.target.value })); setAvailableModels([]); setModelFeedback(null); setModelTestFeedback(null); }} placeholder="https://api.example.com/v1" className="h-11 rounded-xl border-slate-200 bg-slate-50/60" required /></div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3"><Label htmlFor="ai-model">模型名称</Label><Button type="button" onClick={loadModels} disabled={loadingModels} variant="outline" size="sm" className="h-8 rounded-lg border-sky-200 bg-white text-[#397499] hover:bg-sky-50 disabled:opacity-70">{loadingModels ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />正在获取</> : <><Bot className="mr-1.5 size-3.5" />获取模型</>}</Button></div>
                {availableModels.length > 0 && <select value={availableModels.includes(form.model) ? form.model : ""} onChange={event => setForm(previous => ({ ...previous, model: event.target.value }))} className="h-11 w-full rounded-xl border border-sky-200 bg-sky-50/50 px-3 text-sm text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100" aria-label="选择已获取的模型"><option value="">从已获取模型中选择</option>{availableModels.map(model => <option key={model} value={model}>{model}</option>)}</select>}
                <Input id="ai-model" value={form.model} onChange={event => { setForm(previous => ({ ...previous, model: event.target.value })); setModelTestFeedback(null); }} placeholder="例如 step-3.7-flash；也可点击上方自动获取" className="h-11 rounded-xl border-slate-200 bg-slate-50/60" required />
                <p className="text-xs leading-5 text-slate-400">先填写地址和密钥，再点“获取模型”。接口未提供列表时仍可手动填写模型名称。</p>
                {modelFeedback && <p aria-live="polite" role={modelFeedback.kind === "error" ? "alert" : undefined} className={`config-feedback-enter config-feedback-${modelFeedback.kind} rounded-lg px-3 py-2 text-xs leading-5 ${modelFeedback.kind === "loading" ? "bg-sky-50 text-sky-700" : modelFeedback.kind === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{modelFeedback.kind === "loading" && <Loader2 className="mr-1.5 inline size-3.5 animate-spin" />}{modelFeedback.text}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-key">API Key</Label>
                <div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="ai-key" type={showKey ? "text" : "password"} value={form.apiKey} onChange={event => { setForm(previous => ({ ...previous, apiKey: event.target.value })); setAvailableModels([]); setModelFeedback(null); setModelTestFeedback(null); }} placeholder="sk-..." className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pl-10 pr-11" autoComplete="off" required /><button type="button" onClick={() => setShowKey(value => !value)} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}>{showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
              </div>

              <details className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700">多模态创作端点（可选）<span className="ml-2 text-xs font-normal text-slate-400">图片、语音、音乐、视频</span></summary>
                <p className="mt-2 text-xs leading-5 text-slate-500">留空时会按当前 API Base URL 推导 OpenAI 兼容路径。各服务的模型名和路径不一致时，可在这里分别覆盖；仍使用同一把仅保存在本机的 API Key。</p>
                <div className="mt-3 space-y-3">{(["image", "speech", "music", "video"] as const).map(capability => <div key={capability} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold text-slate-600">{{ image: "图片生成", speech: "语音合成", music: "音乐生成", video: "视频生成" }[capability]}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><Input value={form.media?.[capability]?.endpoint ?? ""} onChange={event => setForm(previous => ({ ...previous, media: { ...previous.media, [capability]: { ...previous.media?.[capability], endpoint: event.target.value } } }))} placeholder="可选：完整 HTTPS 端点" className="h-9 rounded-lg border-slate-200 bg-slate-50 text-xs" /><Input value={form.media?.[capability]?.model ?? ""} onChange={event => setForm(previous => ({ ...previous, media: { ...previous.media, [capability]: { ...previous.media?.[capability], model: event.target.value } } }))} placeholder="可选：专用模型名" className="h-9 rounded-lg border-slate-200 bg-slate-50 text-xs" /></div>{capability === "speech" && <Input value={form.media?.speech?.voice ?? ""} onChange={event => setForm(previous => ({ ...previous, media: { ...previous.media, speech: { ...previous.media?.speech, voice: event.target.value } } }))} placeholder="可选：语音名，默认 alloy" className="mt-2 h-9 rounded-lg border-slate-200 bg-slate-50 text-xs" />}</div>)}</div>
              </details>

              <div className="space-y-2">
                <Label htmlFor="ai-persona">人物设定（可选）</Label>
                <Textarea id="ai-persona" value={form.persona} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setForm(previous => ({ ...previous, persona: event.target.value }))} placeholder="例如：你是一位严谨的工程师，回答时先给结论再展开。" className="min-h-24 rounded-xl border-slate-200 bg-slate-50/60" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-welcome">专属欢迎语（可选）</Label>
                <Textarea id="ai-welcome" value={form.welcome ?? ""} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setForm(previous => ({ ...previous, welcome: event.target.value }))} maxLength={180} placeholder="例如：你好，我是你的写作伙伴。今天想写点什么？" className="min-h-20 rounded-xl border-slate-200 bg-slate-50/60" />
                <div className="flex items-center justify-between gap-3"><p className="text-xs leading-5 text-slate-400">新建对话且尚无消息时，会以此欢迎语替代默认提示。</p><Button type="button" onClick={saveWelcome} variant="outline" size="sm" className="h-8 shrink-0 rounded-lg border-violet-200 bg-white text-violet-700 hover:bg-violet-50">保存欢迎语</Button></div>
              </div>

              <section className="rounded-2xl border border-violet-100 bg-violet-50/45 p-4" aria-labelledby="ai-appearance-title">
                <div className="flex gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-violet-600 shadow-sm"><Palette className="size-4" /></div>
                  <div>
                    <h3 id="ai-appearance-title" className="text-sm font-semibold text-slate-700">这个 AI 的外观</h3>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">点击即保存到当前 AI；不同角色可拥有不同视觉标记。</p>
                  </div>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-white bg-white shadow-sm" aria-label="实时聊天界面预览">
                  <div className="min-h-40 p-3" style={previewTexture(appearance)}>
                    <div className="mb-3 flex items-center justify-between" style={{ fontSize: previewFontSize(appearance.fontScale) }}>
                      <span className="font-semibold text-slate-700">实时聊天预览</span>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-slate-500 shadow-sm">{form.name || "当前 AI"}</span>
                    </div>
                    <div className="space-y-2" style={{ fontSize: previewFontSize(appearance.fontScale) }}>
                      <div className="w-fit max-w-[82%] bg-white/90 px-3 py-2 text-slate-600 shadow-sm" style={{ borderRadius: previewRadius(appearance.bubbleRadius) }}>你好，我会按你的风格来回答。</div>
                      <div className="ml-auto w-fit max-w-[82%] px-3 py-2 text-white shadow-sm" style={{ borderRadius: previewRadius(appearance.bubbleRadius), backgroundColor: previewPalette[appearance.accent].primary }}>这样看起来很舒服。</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2 text-[10px] text-slate-500"><span>会随下方选项即时变化</span><span className="font-semibold" style={{ color: previewPalette[appearance.accent].primary }}>{accentOptions.find(option => option.value === appearance.accent)?.label}主题</span></div>
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold text-slate-500">主题色</p>
                    <div className="flex flex-wrap gap-2">
                      {accentOptions.map(option => {
                        const selected = (form.appearance?.accent ?? DEFAULT_AI_APPEARANCE.accent) === option.value;
                        return <button key={option.value} type="button" onClick={() => saveAppearance({ accent: option.value })} className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition ${selected ? "border-violet-300 bg-white text-slate-800 shadow-sm" : "border-transparent bg-white/65 text-slate-500 hover:bg-white"}`} aria-pressed={selected}><span className={`size-3 rounded-full ${option.className}`} />{option.label}</button>;
                      })}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Type className="size-3.5" />字体大小</p>
                      <div className="grid grid-cols-3 rounded-xl bg-white/70 p-1">
                        {fontScaleOptions.map(option => { const selected = (form.appearance?.fontScale ?? DEFAULT_AI_APPEARANCE.fontScale) === option.value; return <button key={option.value} type="button" onClick={() => saveAppearance({ fontScale: option.value })} className={`h-8 rounded-lg text-xs font-semibold transition ${selected ? "bg-violet-600 text-white shadow-sm" : "text-slate-500 hover:bg-white"}`} aria-pressed={selected}>{option.label}</button>; })}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold text-slate-500">气泡圆角</p>
                      <div className="grid grid-cols-3 rounded-xl bg-white/70 p-1">
                        {radiusOptions.map(option => { const selected = (form.appearance?.bubbleRadius ?? DEFAULT_AI_APPEARANCE.bubbleRadius) === option.value; return <button key={option.value} type="button" onClick={() => saveAppearance({ bubbleRadius: option.value })} className={`h-8 rounded-lg text-xs font-semibold transition ${selected ? "bg-violet-600 text-white shadow-sm" : "text-slate-500 hover:bg-white"}`} aria-pressed={selected}>{option.label}</button>; })}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold text-slate-500">聊天背景</p>
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/70 p-1">
                      {textureOptions.map(option => { const selected = (form.appearance?.chatTexture ?? DEFAULT_AI_APPEARANCE.chatTexture) === option.value; return <button key={option.value} type="button" onClick={() => saveAppearance({ chatTexture: option.value })} className={`h-8 rounded-lg text-xs font-semibold transition ${selected ? "bg-violet-600 text-white shadow-sm" : "text-slate-500 hover:bg-white"}`} aria-pressed={selected}>{option.label}</button>; })}
                    </div>
                  </div>
                  <div className="border-t border-violet-100 pt-4">
                    <p className="text-xs font-semibold text-slate-600">保存为主题预设</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">预设只保存在当前 Safari，可快速套用到任意 AI。</p>
                    <div className="mt-2 flex gap-2"><Input value={presetName} onChange={event => setPresetName(event.target.value)} maxLength={24} placeholder="例如：深夜写作" className="h-9 rounded-xl border-violet-100 bg-white text-sm" /><Button type="button" onClick={savePreset} className="h-9 shrink-0 rounded-xl bg-violet-600 px-3 text-xs text-white hover:bg-violet-700"><BookmarkPlus className="mr-1 size-3.5" />保存</Button></div>
                    {presets.length > 0 ? <><p className="mt-3 text-[10px] text-slate-400">按住左侧手柄拖动排序；顺序会保存在当前 Safari。</p><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderPresets}><SortableContext items={presets.map(preset => preset.id)} strategy={verticalListSortingStrategy}><div className="mt-1.5 space-y-1.5" aria-label="已保存主题预设">{presets.map(preset => <SortablePresetItem key={preset.id} preset={preset} summary={`${accentOptions.find(option => option.value === preset.appearance.accent)?.label} · ${fontScaleOptions.find(option => option.value === preset.appearance.fontScale)?.label}字 · ${textureOptions.find(option => option.value === preset.appearance.chatTexture)?.label}`} onApply={() => applyPreset(preset)} onRemove={() => removePreset(preset.id)} />)}</div></SortableContext></DndContext></> : <p className="mt-3 rounded-xl border border-dashed border-violet-100 bg-white/55 px-3 py-2 text-xs text-slate-400">还没有保存的主题预设。</p>}
                  </div>
                </div>
              </section>

              <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-3.5">
                <div className="flex gap-3"><Wifi className="mt-0.5 size-4 shrink-0 text-[#4a86a8]" /><div><p className="text-sm font-semibold text-slate-700">保存前验证</p><p className="mt-0.5 text-xs leading-5 text-slate-500">可先检查 <code>/models</code> 是否可访问；“测试当前模型”会发送一次不写入聊天记录的最小化请求，以同时验证 Key 和模型名称。</p></div></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button type="button" onClick={testConnection} disabled={testingConnection || testingSelectedModel} variant="outline" className="h-10 rounded-xl border-sky-200 bg-white text-[#397499] hover:bg-sky-50">{testingConnection ? <><Loader2 className="mr-2 size-4 animate-spin" />正在检查</> : <><Wifi className="mr-2 size-4" />检查 API 连接</>}</Button>
                  <Button type="button" onClick={testCurrentModel} disabled={testingConnection || testingSelectedModel} className="h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-700">{testingSelectedModel ? <><Loader2 className="mr-2 size-4 animate-spin" />正在测试</> : <><CheckCircle2 className="mr-2 size-4" />测试当前模型</>}</Button>
                </div>
                {modelTestFeedback && <p aria-live="polite" role={modelTestFeedback.kind === "error" ? "alert" : undefined} className={`config-feedback-enter config-feedback-${modelTestFeedback.kind} mt-3 rounded-lg px-3 py-2 text-xs leading-5 ${modelTestFeedback.kind === "loading" ? "bg-sky-100/70 text-sky-700" : modelTestFeedback.kind === "success" ? "bg-emerald-100/70 text-emerald-700" : "bg-rose-100/70 text-rose-700"}`}>{modelTestFeedback.kind === "loading" && <Loader2 className="mr-1.5 inline size-3.5 animate-spin" />}{modelTestFeedback.text}</p>}
              </div>

              <Button type="submit" className="h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-700"><CheckCircle2 className="mr-2 size-4" />保存 {form.name || "AI"}</Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
