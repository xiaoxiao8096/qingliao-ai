import {
  assetKindLabel,
  deleteLocalAsset,
  formatAssetSize,
  getLocalAsset,
  listLocalAssets,
  localAssetStorageEstimate,
  saveLocalAsset,
  updateLocalAsset,
  type AssetKind,
  type LocalAsset,
} from "@/lib/localAssets";
import {
  ArrowLeft,
  Archive,
  Sparkles,
  AudioLines,
  Code2,
  Download,
  File,
  FileText,
  Film,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Music2,
  Pencil,
  Presentation,
  RefreshCw,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { useLocation } from "wouter";

type LoadedAsset = LocalAsset & { blob: Blob };

const kindIcons: Record<AssetKind, typeof File> = {
  image: ImageIcon, audio: AudioLines, video: Video, html: Code2, markdown: FileText, pdf: FileText, docx: FileText, pptx: Presentation, text: FileText, other: File,
};

const kindAccent: Record<AssetKind, string> = {
  image: "bg-violet-100 text-violet-700", audio: "bg-rose-100 text-rose-700", video: "bg-amber-100 text-amber-700", html: "bg-sky-100 text-sky-700", markdown: "bg-emerald-100 text-emerald-700", pdf: "bg-red-100 text-red-700", docx: "bg-blue-100 text-blue-700", pptx: "bg-orange-100 text-orange-700", text: "bg-slate-100 text-slate-700", other: "bg-slate-100 text-slate-600",
};

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function downloadBlob(asset: LoadedAsset) {
  const url = URL.createObjectURL(asset.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = asset.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function AssetPreview({ asset, objectUrl }: { asset: LoadedAsset; objectUrl: string }) {
  const [text, setText] = useState("");
  const [loadingText, setLoadingText] = useState(false);
  const [officeError, setOfficeError] = useState("");
  const [pptSlides, setPptSlides] = useState<string[]>([]);
  const docxTarget = useRef<HTMLDivElement>(null);
  const pptCanvas = useRef<HTMLCanvasElement>(null);
  const pptViewer = useRef<import("pptxviewjs").PPTXViewer | null>(null);
  const [pptPosition, setPptPosition] = useState({ current: 0, total: 0 });

  useEffect(() => {
    let disposed = false;
    setText("");
    setPptSlides([]);
    setOfficeError("");
    setPptPosition({ current: 0, total: 0 });
    if (!["html", "markdown", "text"].includes(asset.kind)) return;
    setLoadingText(true);
    asset.blob.text().then(value => { if (!disposed) setText(value); }).catch(() => { if (!disposed) setOfficeError("无法读取此文件的文本内容。"); }).finally(() => { if (!disposed) setLoadingText(false); });
    return () => { disposed = true; };
  }, [asset]);

  useEffect(() => {
    let disposed = false;
    if (asset.kind !== "docx" || !docxTarget.current) return;
    setLoadingText(true);
    import("docx-preview").then(({ renderAsync }) => {
      if (disposed || !docxTarget.current) return;
      docxTarget.current.replaceChildren();
      return renderAsync(asset.blob, docxTarget.current, undefined, { className: "qingliao-docx", inWrapper: false, ignoreLastRenderedPageBreak: false });
    }).catch(() => { if (!disposed) setOfficeError("DOCX 预览未能加载；你仍可下载原文件。"); }).finally(() => { if (!disposed) setLoadingText(false); });
    return () => { disposed = true; };
  }, [asset]);

  useEffect(() => {
    let disposed = false;
    if (asset.kind !== "pptx") return;
    setLoadingText(true);
    import("jszip").then(async ({ default: JSZip }) => {
      const zip = await JSZip.loadAsync(asset.blob);
      const names = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
      const slides = await Promise.all(names.map(async name => {
        const xml = await zip.file(name)?.async("string");
        const document = new DOMParser().parseFromString(xml ?? "", "application/xml");
        return Array.from(document.querySelectorAll("t")).map(node => node.textContent?.trim() ?? "").filter(Boolean).join("\n");
      }));
      if (!disposed) setPptSlides(slides);
    }).catch(() => { if (!disposed) setPptSlides([]); }).finally(() => { if (!disposed) setLoadingText(false); });
    return () => { disposed = true; };
  }, [asset]);

  useEffect(() => {
    let disposed = false;
    if (asset.kind !== "pptx" || asset.name.toLocaleLowerCase().endsWith(".ppt") || !pptCanvas.current) return;
    setLoadingText(true);
    import("pptxviewjs").then(async ({ PPTXViewer }) => {
      if (disposed || !pptCanvas.current) return;
      const viewer = new PPTXViewer({ canvas: pptCanvas.current, slideSizeMode: "fit", backgroundColor: "#ffffff" });
      pptViewer.current = viewer;
      const file = new globalThis.File([asset.blob], asset.name, { type: asset.mimeType || "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      await viewer.loadFile(file);
      if (disposed) return;
      await viewer.render(pptCanvas.current, { quality: "high" });
      if (!disposed) setPptPosition({ current: viewer.getCurrentSlideIndex(), total: viewer.getSlideCount() });
    }).catch(error => { console.error("PPTX visual preview failed", error); if (!disposed) setOfficeError("PPTX 视觉预览未能加载；已保留文字提取和原文件下载。"); }).finally(() => { if (!disposed) setLoadingText(false); });
    return () => { disposed = true; pptViewer.current?.destroy(); pptViewer.current = null; };
  }, [asset]);

  const navigatePpt = async (direction: "previous" | "next") => {
    const viewer = pptViewer.current;
    if (!viewer || !pptCanvas.current) return;
    try {
      if (direction === "previous") await viewer.previousSlide(pptCanvas.current);
      else await viewer.nextSlide(pptCanvas.current);
      setPptPosition({ current: viewer.getCurrentSlideIndex(), total: viewer.getSlideCount() });
    } catch { setOfficeError("幻灯片切换失败；你仍可下载原文件查看。 "); }
  };

  if (asset.kind === "image") return <img src={objectUrl} alt={asset.name} className="max-h-[60vh] w-full rounded-xl object-contain" />;
  if (asset.kind === "audio") return <div className="grid min-h-64 place-items-center rounded-2xl bg-gradient-to-br from-rose-50 to-violet-50 p-6"><div className="text-center"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-rose-500 text-white shadow-lg"><Music2 className="size-8" /></span><p className="mt-4 font-semibold text-slate-700">{asset.name}</p><audio controls src={objectUrl} className="mt-4 max-w-full" /></div></div>;
  if (asset.kind === "video") return <video controls src={objectUrl} className="max-h-[60vh] w-full rounded-xl bg-slate-950" />;
  if (asset.kind === "pdf") return <iframe src={objectUrl} title={`${asset.name} 预览`} className="h-[60vh] w-full rounded-xl border border-slate-200 bg-white" />;
  if (asset.kind === "html") return <iframe srcDoc={text} sandbox="" title={`${asset.name} 安全预览`} className="h-[60vh] w-full rounded-xl border border-slate-200 bg-white" />;
  if (asset.kind === "markdown") return <div className="min-h-[26rem] rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700"><Streamdown>{text}</Streamdown></div>;
  if (asset.kind === "docx") return asset.name.toLocaleLowerCase().endsWith(".doc") ? <div className="grid min-h-64 place-items-center rounded-2xl bg-slate-50 p-6 text-center"><FileText className="size-10 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">旧版 .doc 仅支持下载查看</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">为保持完全本机、无上传，当前仅在浏览器内渲染 DOCX；请将旧版 Word 另存为 DOCX 后再预览。</p></div> : <div className="min-h-[26rem] overflow-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-700"><div ref={docxTarget} className="qingliao-docx-preview" /></div>;
  if (asset.kind === "pptx") return asset.name.toLocaleLowerCase().endsWith(".ppt") ? <div className="grid min-h-64 place-items-center rounded-2xl bg-slate-50 p-6 text-center"><Presentation className="size-10 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">旧版 .ppt 仅支持下载查看</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">为保持完全本机、无上传，当前在浏览器内渲染 PPTX；请将旧版 PowerPoint 另存为 PPTX 后再预览。</p></div> : <div className="space-y-3"><div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><canvas ref={pptCanvas} className="block h-auto w-full bg-white" aria-label={`${asset.name} 幻灯片视觉预览`} /></div>{pptPosition.total > 1 && <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"><button type="button" onClick={() => void navigatePpt("previous")} disabled={pptPosition.current <= 0} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-40">上一页</button><span className="text-xs text-slate-500">第 {pptPosition.current + 1} / {pptPosition.total} 页</span><button type="button" onClick={() => void navigatePpt("next")} disabled={pptPosition.current >= pptPosition.total - 1} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-40">下一页</button></div>}{officeError && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">{officeError}</p>}{pptSlides.length > 0 && <details className="rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">查看可提取文字</summary><div className="mt-3 space-y-2">{pptSlides.map((slide, index) => <section key={index} className="rounded-lg bg-slate-50 p-2.5"><p className="text-[10px] font-bold tracking-[0.12em] text-slate-400">幻灯片 {index + 1}</p><pre className="mt-1.5 whitespace-pre-wrap font-sans text-xs leading-5 text-slate-600">{slide || "（该页没有可提取的文字）"}</pre></section>)}</div></details>}{!loadingText && pptPosition.total === 0 && pptSlides.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">未找到可阅读的幻灯片内容；你仍可下载原文件查看。</p>}</div>;
  if (asset.kind === "text") return <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{text}</pre>;
  return <div className="grid min-h-64 place-items-center rounded-2xl bg-slate-50 p-6 text-center"><File className="size-10 text-slate-300" /><p className="mt-3 text-sm text-slate-500">此文件暂不能站内预览。</p><p className="mt-1 text-xs text-slate-400">可下载原文件，在本机应用中打开。</p></div>;
}

export default function Library() {
  const [, setLocation] = useLocation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [selected, setSelected] = useState<LoadedAsset | null>(null);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [importCategory, setImportCategory] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });

  const refresh = async () => {
    setLoading(true);
    try {
      const [nextAssets, estimate] = await Promise.all([listLocalAssets(), localAssetStorageEstimate()]);
      setAssets(nextAssets);
      setStorage(estimate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "本机素材库读取失败。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!selected) { setSelectedUrl(""); return; }
    const url = URL.createObjectURL(selected.blob);
    setSelectedUrl(url);
    setDraftName(selected.name);
    setDraftCategory(selected.category);
    setEditing(false);
    return () => URL.revokeObjectURL(url);
  }, [selected]);

  const categories = useMemo(() => Array.from(new Set(assets.map(asset => asset.category))).sort((left, right) => left.localeCompare(right, "zh-CN")), [assets]);
  const visibleAssets = useMemo(() => {
    const lowerQuery = query.trim().toLocaleLowerCase();
    return assets.filter(asset => (kindFilter === "all" || asset.kind === kindFilter) && (categoryFilter === "all" || asset.category === categoryFilter) && (!lowerQuery || `${asset.name} ${asset.category} ${assetKindLabel(asset.kind)}`.toLocaleLowerCase().includes(lowerQuery)));
  }, [assets, categoryFilter, kindFilter, query]);

  const chooseAsset = async (id: string) => {
    try {
      const asset = await getLocalAsset(id);
      if (!asset) { toast.error("素材已不存在。"); await refresh(); return; }
      setSelected(asset);
    } catch (error) { toast.error(error instanceof Error ? error.message : "素材无法打开。"); }
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setImporting(true);
    let count = 0;
    try {
      for (const file of Array.from(files).slice(0, 20)) { await saveLocalAsset(file, { category: importCategory }); count += 1; }
      await refresh();
      toast.success(`已保存 ${count} 个文件到本机素材库。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "部分文件未能保存。", { description: count ? `已保存 ${count} 个文件。` : undefined });
      await refresh();
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const saveMetadata = async () => {
    if (!selected) return;
    try {
      const updated = await updateLocalAsset(selected.id, { name: draftName, category: draftCategory });
      setSelected(previous => previous ? { ...previous, ...updated } : previous);
      setAssets(previous => previous.map(asset => asset.id === updated.id ? updated : asset));
      setEditing(false);
      toast.success("素材信息已保存。");
    } catch (error) { toast.error(error instanceof Error ? error.message : "素材信息保存失败。"); }
  };

  const removeSelected = async () => {
    if (!selected || !window.confirm(`删除“${selected.name}”吗？此操作会移除当前浏览器中的文件。`)) return;
    try {
      await deleteLocalAsset(selected.id);
      setSelected(null);
      await refresh();
      toast.success("已从本机素材库删除。");
    } catch (error) { toast.error(error instanceof Error ? error.message : "删除失败。"); }
  };

  return <main className="min-h-dvh bg-[#f6f8fb] text-slate-800">
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-7"><div className="mx-auto flex max-w-7xl items-center gap-3"><button type="button" onClick={() => setLocation("/")} className="grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="返回聊天"><ArrowLeft className="size-4" /></button><span className="grid size-9 place-items-center rounded-xl bg-slate-900 text-white"><Archive className="size-4" /></span><div className="min-w-0 flex-1"><h1 className="text-base font-black tracking-tight">本机素材库</h1><p className="truncate text-[11px] text-slate-500">仅保存在当前浏览器 · 不上传 · 不跨设备同步</p></div><button type="button" onClick={() => setLocation("/create")} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-700"><Sparkles className="size-3.5" />创作</button><button type="button" onClick={() => void refresh()} className="grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="刷新素材库"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></button></div></header>
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6 lg:grid-cols-[20rem_minmax(0,1fr)_minmax(22rem,0.9fr)]">
      <aside className="rounded-2xl bg-white p-3 shadow-sm lg:sticky lg:top-20 lg:h-fit"><button type="button" onClick={() => fileInput.current?.click()} disabled={importing} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"><Upload className="size-4" />{importing ? "保存中…" : "导入到本机素材库"}</button><input ref={fileInput} type="file" multiple className="hidden" onChange={event => void importFiles(event.target.files)} aria-label="导入文件到本机素材库" />
        <label className="mt-3 block text-[11px] font-semibold text-slate-500">导入分类<input value={importCategory} onChange={event => setImportCategory(event.target.value)} placeholder="留空则按文件类型分类" maxLength={24} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100" /></label>
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800"><p className="font-bold">本机存储说明</p><p className="mt-1">文件仅存在此浏览器的本机空间。清除站点数据、换设备或浏览器卸载不会保留；重要作品请下载备份。</p></div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><HardDrive className="size-4 text-slate-400" /><span>{storage.quota ? `已用 ${formatAssetSize(storage.usage)} / 可用约 ${formatAssetSize(storage.quota)}` : `已记录 ${assets.length} 个本机素材`}</span></div>
      </aside>
      <section className="min-w-0"><div className="rounded-2xl bg-white p-3 shadow-sm"><div className="flex flex-wrap items-center gap-2"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称或分类" className="min-w-40 flex-1 rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none ring-1 ring-slate-200 focus:ring-sky-300" /><select value={kindFilter} onChange={event => setKindFilter(event.target.value as AssetKind | "all")} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-slate-600"><option value="all">全部类型</option>{(["image", "audio", "video", "html", "markdown", "pdf", "docx", "pptx", "text", "other"] as AssetKind[]).map(kind => <option key={kind} value={kind}>{assetKindLabel(kind)}</option>)}</select><select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-slate-600"><option value="all">全部分类</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></div></div>
        {loading ? <div className="grid min-h-64 place-items-center"><Loader2 className="size-6 animate-spin text-slate-400" /></div> : visibleAssets.length === 0 ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center"><Archive className="size-9 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">还没有匹配的本机素材</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">导入创作文件，或在后续生成图片、音频、视频时将结果直接归档到这里。</p></div> : <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{visibleAssets.map(asset => { const Icon = kindIcons[asset.kind]; return <button type="button" key={asset.id} onClick={() => void chooseAsset(asset.id)} className={`min-w-0 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selected?.id === asset.id ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white"}`}><span className={`grid size-9 place-items-center rounded-xl ${kindAccent[asset.kind]}`}><Icon className="size-4" /></span><span className="mt-3 block truncate text-sm font-semibold text-slate-700">{asset.name}</span><span className="mt-1 flex items-center justify-between gap-1 text-[10px] text-slate-400"><span className="truncate">{asset.category}</span><span>{formatAssetSize(asset.size)}</span></span></button>; })}</div>}</section>
      <aside className="min-w-0 rounded-2xl bg-white p-3 shadow-sm lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">{!selected ? <div className="grid min-h-64 place-items-center p-6 text-center"><File className="size-9 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">选择一个素材查看</p><p className="mt-1 text-xs leading-5 text-slate-400">图片、音频、视频和常见文档会在这里预览。</p></div> : <><div className="flex items-start gap-2"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${kindAccent[selected.kind]}`}>{(() => { const Icon = kindIcons[selected.kind]; return <Icon className="size-4" />; })()}</span><div className="min-w-0 flex-1">{editing ? <input value={draftName} onChange={event => setDraftName(event.target.value)} className="h-8 w-full rounded-lg border border-slate-200 px-2 text-sm font-semibold outline-none focus:border-sky-300" /> : <p className="truncate text-sm font-bold text-slate-700">{selected.name}</p>}<p className="mt-0.5 text-[11px] text-slate-400">{assetKindLabel(selected.kind)} · {formatAssetSize(selected.size)} · {formatDate(selected.updatedAt)}</p></div><button type="button" onClick={() => setEditing(value => !value)} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="编辑素材信息"><Pencil className="size-3.5" /></button><button type="button" onClick={removeSelected} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label="删除本机素材"><Trash2 className="size-3.5" /></button></div>
        {editing && <div className="mt-3 flex gap-2"><input value={draftCategory} onChange={event => setDraftCategory(event.target.value)} placeholder="分类" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-sky-300" /><button type="button" onClick={() => void saveMetadata()} className="rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white">保存</button></div>}
        <div className="mt-4"><AssetPreview asset={selected} objectUrl={selectedUrl} /></div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">{selected.kind === "html" ? "HTML 在隔离沙箱中展示，脚本不会执行。" : selected.kind === "pptx" ? "PPTX 当前展示可提取的幻灯片文字；复杂动画、图表与版式请下载原件查看。" : selected.kind === "docx" ? "DOCX 在当前浏览器渲染；个别字体与复杂分页可能与 Word 不完全一致。" : "预览在当前浏览器内完成，文件不会上传。"}</div>
        <button type="button" onClick={() => downloadBlob(selected)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Download className="size-4" />下载原文件</button></>}</aside>
    </div>
  </main>;
}
