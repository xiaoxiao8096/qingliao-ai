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
import { BACKGROUND_GRAIN_TEXTURE, backgroundGradientOverlay, backgroundImageFileToDataUrl, BACKGROUND_FILTER_PRESETS, BACKGROUND_LAYOUT_PRESETS, backgroundTemperatureOverlay, backgroundVignetteOverlay, BUILTIN_AI_THEMES, createCustomBackgroundFilterPreset, createCustomPromptShortcut, DEFAULT_AI_APPEARANCE, DEFAULT_PROMPT_SHORTCUTS, getActiveAIId, getAIProfiles, getCustomBackgroundFilterPresets, getCustomPromptShortcuts, getUserProfile, saveAIProfiles, saveCustomBackgroundFilterPresets, saveCustomPromptShortcuts, setActiveAIId, type AIAppearance, type BackgroundFilter, type CustomBackgroundFilterPreset, type CustomPromptShortcut, type LocalAIProfile } from "@/lib/localProfiles";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  GripVertical,
  Palette,
  Type,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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

const radiusOptions = [
  { value: "soft", label: "柔和", hint: "轻圆角", sampleClass: "rounded-md" },
  { value: "rounded", label: "圆润", hint: "大圆角", sampleClass: "rounded-2xl" },
  { value: "pill", label: "胶囊", hint: "全圆角", sampleClass: "rounded-full" },
] as const;

function sameBackgroundLayout(appearance: AIAppearance, layout: { backgroundScale: number; backgroundPositionX: number; backgroundPositionY: number }) {
  return appearance.backgroundScale === layout.backgroundScale
    && appearance.backgroundPositionX === layout.backgroundPositionX
    && appearance.backgroundPositionY === layout.backgroundPositionY;
}

function sameBackgroundFilter(appearance: AIAppearance, filter: BackgroundFilter) {
  return appearance.backgroundBlur === filter.backgroundBlur
    && appearance.backgroundBrightness === filter.backgroundBrightness
    && appearance.backgroundContrast === filter.backgroundContrast
    && appearance.backgroundSaturation === filter.backgroundSaturation
    && appearance.backgroundTemperature === filter.backgroundTemperature
    && appearance.backgroundVignette === filter.backgroundVignette
    && appearance.backgroundGrain === filter.backgroundGrain
    && appearance.backgroundGradientStart === filter.backgroundGradientStart
    && appearance.backgroundGradientEnd === filter.backgroundGradientEnd
    && appearance.backgroundGradientOpacity === filter.backgroundGradientOpacity
    && appearance.backgroundGradientAngle === filter.backgroundGradientAngle;
}

function SortableBackgroundFilterPreset({ preset, onApply, onRename, onRemove }: { preset: CustomBackgroundFilterPreset; onApply: () => void; onRename: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: preset.id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-1 rounded-md bg-slate-50 p-1 ${isDragging ? "z-10 opacity-70 shadow-lg" : ""}`}>
    <button type="button" className="grid size-6 shrink-0 touch-none place-items-center rounded text-slate-400 hover:bg-white hover:text-sky-700" aria-label={`拖动排序自定义滤镜组合 ${preset.name}`} {...attributes} {...listeners}><GripVertical className="size-3" /></button>
    <button type="button" onClick={onApply} className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-[10px] font-medium text-slate-700 hover:bg-white" aria-label={`应用自定义滤镜组合 ${preset.name}`}>{preset.name}</button>
    <button type="button" onClick={onRename} className="grid size-6 place-items-center rounded text-slate-400 hover:bg-white hover:text-sky-700" aria-label={`重命名自定义滤镜组合 ${preset.name}`}><Pencil className="size-3" /></button>
    <button type="button" onClick={onRemove} className="grid size-6 place-items-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`删除自定义滤镜组合 ${preset.name}`}><Trash2 className="size-3" /></button>
  </div>;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
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
  const drawerCloseTimer = useRef<number | null>(null);
  const cropDragRef = useRef(false);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const [isSavingBackground, setIsSavingBackground] = useState(false);
  const [customPromptShortcuts, setCustomPromptShortcuts] = useState<CustomPromptShortcut[]>(() => getCustomPromptShortcuts());
  const [customBackgroundFilterPresets, setCustomBackgroundFilterPresets] = useState<CustomBackgroundFilterPreset[]>(() => getCustomBackgroundFilterPresets());
  const [isFilterPresetEditorOpen, setIsFilterPresetEditorOpen] = useState(false);
  const [editingBackgroundFilterPresetId, setEditingBackgroundFilterPresetId] = useState<string | null>(null);
  const [filterPresetName, setFilterPresetName] = useState("");
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptTitle, setPromptTitle] = useState("");
  const [promptContent, setPromptContent] = useState("");
  useEffect(() => () => { abortRef.current?.abort(); if (drawerCloseTimer.current !== null) window.clearTimeout(drawerCloseTimer.current); }, []);
  const activeAI = profiles.find(profile => profile.id === activeAIId) ?? profiles[0];
  const filterPresetSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const currentAppearance = { ...DEFAULT_AI_APPEARANCE, ...activeAI?.appearance, backgroundSaturation: activeAI?.appearance?.backgroundSaturation ?? 100, backgroundTemperature: activeAI?.appearance?.backgroundTemperature ?? 0, backgroundVignette: activeAI?.appearance?.backgroundVignette ?? 0, backgroundGrain: activeAI?.appearance?.backgroundGrain ?? 0, backgroundGradientStart: activeAI?.appearance?.backgroundGradientStart ?? "#4f8fd8", backgroundGradientEnd: activeAI?.appearance?.backgroundGradientEnd ?? "#8b5cf6", backgroundGradientOpacity: activeAI?.appearance?.backgroundGradientOpacity ?? 0, backgroundGradientAngle: activeAI?.appearance?.backgroundGradientAngle ?? 135 };

  useEffect(() => {
    const appearance = { ...DEFAULT_AI_APPEARANCE, ...activeAI?.appearance };
    setAccent(appearance.accent);
    setFontScale(appearance.fontScale);
    setBubbleRadius(appearance.bubbleRadius);
    setChatTexture(appearance.chatTexture);
  }, [activeAI?.id, activeAI?.appearance]);

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

  const promptShortcuts = useMemo(() => [...DEFAULT_PROMPT_SHORTCUTS, ...customPromptShortcuts], [customPromptShortcuts]);

  function resetPromptEditor() {
    setEditingPromptId(null);
    setPromptTitle("");
    setPromptContent("");
  }

  function savePromptShortcut() {
    const title = promptTitle.trim();
    const prompt = promptContent.trim();
    if (!title || !prompt) {
      toast.error("请填写提示词名称和内容。");
      return;
    }
    const now = Date.now();
    const next = editingPromptId
      ? customPromptShortcuts.map(item => item.id === editingPromptId ? { ...item, title: title.slice(0, 24), prompt: prompt.slice(0, 600), updatedAt: now } : item)
      : [...customPromptShortcuts, createCustomPromptShortcut(title, prompt)];
    setCustomPromptShortcuts(next);
    saveCustomPromptShortcuts(next);
    toast.success(editingPromptId ? "提示词已更新。" : "专属提示词已添加。");
    resetPromptEditor();
  }

  function editPromptShortcut(item: CustomPromptShortcut) {
    setEditingPromptId(item.id);
    setPromptTitle(item.title);
    setPromptContent(item.prompt);
    setIsPromptEditorOpen(true);
  }

  function removePromptShortcut(id: string) {
    const next = customPromptShortcuts.filter(item => item.id !== id);
    setCustomPromptShortcuts(next);
    saveCustomPromptShortcuts(next);
    if (editingPromptId === id) resetPromptEditor();
    toast.success("专属提示词已删除。");
  }

  async function selectBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeAI) return;
    setIsSavingBackground(true);
    try {
      const backgroundImage = await backgroundImageFileToDataUrl(file);
      updateActiveAppearance({ backgroundImage });
      toast.success("自定义聊天背景已保存到当前 AI。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "背景图片保存失败。");
    } finally {
      setIsSavingBackground(false);
    }
  }

  function resetBackgroundLayout() {
    updateActiveAppearance({
      backgroundScale: DEFAULT_AI_APPEARANCE.backgroundScale,
      backgroundPositionX: DEFAULT_AI_APPEARANCE.backgroundPositionX,
      backgroundPositionY: DEFAULT_AI_APPEARANCE.backgroundPositionY,
    });
    toast.success("背景布局已重置。");
  }

  function resetBackgroundEffects() {
    updateActiveAppearance({
      backgroundBlur: DEFAULT_AI_APPEARANCE.backgroundBlur,
      backgroundBrightness: DEFAULT_AI_APPEARANCE.backgroundBrightness,
      backgroundContrast: DEFAULT_AI_APPEARANCE.backgroundContrast,
      backgroundSaturation: DEFAULT_AI_APPEARANCE.backgroundSaturation,
      backgroundTemperature: DEFAULT_AI_APPEARANCE.backgroundTemperature,
      backgroundVignette: DEFAULT_AI_APPEARANCE.backgroundVignette,
      backgroundGrain: DEFAULT_AI_APPEARANCE.backgroundGrain,
      backgroundGradientStart: DEFAULT_AI_APPEARANCE.backgroundGradientStart,
      backgroundGradientEnd: DEFAULT_AI_APPEARANCE.backgroundGradientEnd,
      backgroundGradientOpacity: DEFAULT_AI_APPEARANCE.backgroundGradientOpacity,
      backgroundGradientAngle: DEFAULT_AI_APPEARANCE.backgroundGradientAngle,
      backgroundOpacity: DEFAULT_AI_APPEARANCE.backgroundOpacity,
    });
    toast.success("背景滤镜与质感效果已恢复默认。", { description: "图片布局和自定义背景不会改变。" });
  }

  function applyBackgroundLayout(layout: { name: string; layout: { backgroundScale: number; backgroundPositionX: number; backgroundPositionY: number } }) {
    updateActiveAppearance(layout.layout);
    toast.success(`已应用${layout.name}布局。`);
  }

  function applyBackgroundFilter(preset: { name: string; filter: BackgroundFilter }) {
    updateActiveAppearance(preset.filter);
    toast.success(`已应用${preset.name}滤镜。`);
  }

  function saveCurrentBackgroundFilterPreset() {
    const name = filterPresetName.trim();
    if (!name) {
      toast.error("请先填写组合名称。");
      return;
    }
    if (!editingBackgroundFilterPresetId && customBackgroundFilterPresets.length >= 12) {
      toast.error("最多保存 12 个自定义滤镜组合。");
      return;
    }
    const now = Date.now();
    const preset = editingBackgroundFilterPresetId ? null : createCustomBackgroundFilterPreset(name, currentAppearance);
    const next = editingBackgroundFilterPresetId
      ? customBackgroundFilterPresets.map(item => item.id === editingBackgroundFilterPresetId ? { ...item, name: name.slice(0, 20), updatedAt: now } : item)
      : [...customBackgroundFilterPresets, preset!];
    setCustomBackgroundFilterPresets(next);
    saveCustomBackgroundFilterPresets(next);
    setFilterPresetName("");
    setEditingBackgroundFilterPresetId(null);
    setIsFilterPresetEditorOpen(false);
    toast.success(editingBackgroundFilterPresetId ? "滤镜组合已重命名。" : `已保存“${preset!.name}”滤镜组合。`);
  }

  function startRenameCustomBackgroundFilterPreset(preset: CustomBackgroundFilterPreset) {
    setEditingBackgroundFilterPresetId(preset.id);
    setFilterPresetName(preset.name);
    setIsFilterPresetEditorOpen(true);
  }

  function resetBackgroundFilterPresetEditor() {
    setEditingBackgroundFilterPresetId(null);
    setFilterPresetName("");
    setIsFilterPresetEditorOpen(false);
  }

  function reorderCustomBackgroundFilterPresets(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = customBackgroundFilterPresets.findIndex(preset => preset.id === active.id);
    const newIndex = customBackgroundFilterPresets.findIndex(preset => preset.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(customBackgroundFilterPresets, oldIndex, newIndex);
    setCustomBackgroundFilterPresets(next);
    saveCustomBackgroundFilterPresets(next);
    toast.success("滤镜组合顺序已保存。");
  }

  function removeCustomBackgroundFilterPreset(id: string) {
    const next = customBackgroundFilterPresets.filter(preset => preset.id !== id);
    setCustomBackgroundFilterPresets(next);
    saveCustomBackgroundFilterPresets(next);
    toast.success("自定义滤镜组合已删除。");
  }

  function applyBuiltInTheme(theme: { name: string; appearance: Partial<AIAppearance> }) {
    updateActiveAppearance(theme.appearance);
    toast.success(`已应用${theme.name}主题及匹配滤镜。`);
  }

  function updateCropPosition(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const positionX = Math.round(Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)));
    const positionY = Math.round(Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100)));
    updateActiveAppearance({ backgroundPositionX: positionX, backgroundPositionY: positionY });
  }

  function startCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    cropDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateCropPosition(event);
  }

  function stopCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    cropDragRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
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

  function openDrawer() {
    if (drawerCloseTimer.current !== null) window.clearTimeout(drawerCloseTimer.current);
    setDrawerMounted(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDrawerOpen(true);
      return;
    }
    window.requestAnimationFrame(() => setDrawerOpen(true));
  }

  function closeDrawer() {
    setDrawerOpen(false);
    if (drawerCloseTimer.current !== null) window.clearTimeout(drawerCloseTimer.current);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    drawerCloseTimer.current = window.setTimeout(() => setDrawerMounted(false), delay);
  }

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
    closeDrawer();
  }

  function selectAI(id: string) {
    setActiveAIId(id);
    setCurrentAIId(id);
    setActiveConversationId(null);
    setConversationQuery("");
    closeDrawer();
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
    <aside className="mobile-drawer-panel relative z-10 flex h-full w-[min(85vw,320px)] flex-col overflow-y-auto bg-[#f8fafb] px-3 pb-4 pt-4 shadow-[12px_0_35px_rgba(36,54,69,0.08)] lg:w-[300px] lg:shadow-none">
      <div className="flex items-center justify-between px-2 pb-4">
        <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-left" aria-label="回到聊天主页">
          <span className="grid size-8 place-items-center rounded-xl bg-[#dceefa] text-[#417698]"><CircleHelp className="size-4" /></span>
          <span>
            <span className="block text-sm font-black tracking-tight text-slate-900">轻聊 AI</span>
            <span className="block text-[10px] font-semibold tracking-[0.16em] text-slate-400">PRIVATE · LOCAL</span>
          </span>
        </button>
        <button onClick={closeDrawer} className="grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-200 lg:hidden" aria-label="关闭会话面板"><X className="size-4" /></button>
      </div>

      <button onClick={() => { closeDrawer(); setLocation("/ais"); }} className="mb-3 flex w-full items-center gap-2 rounded-xl bg-white p-2 text-left shadow-sm hover:bg-[#edf6fb]">
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
        <div className="mb-2 rounded-xl bg-white p-2 shadow-sm">
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold tracking-[0.1em] text-slate-400"><span className="flex items-center gap-1"><Palette className="size-3" />{activeAI?.name ?? "当前 AI"} 的主题</span><button onClick={() => updateActiveAppearance(DEFAULT_AI_APPEARANCE)} className="text-sky-700 hover:underline">恢复默认</button></div>
          <div className="flex items-center justify-between gap-1">{(["sky", "violet", "rose", "emerald", "amber"] as const).map(color => <button key={color} onClick={() => updateActiveAppearance({ accent: color })} className={`grid size-6 place-items-center rounded-full ${accent === color ? "ring-2 ring-slate-500 ring-offset-2" : ""}`} aria-label={`选择${color}主题色`}><span className={`size-4 rounded-full bg-[var(--accent-${color})]`} /></button>)}</div>
          <div className="mt-2 overflow-hidden rounded-lg bg-[var(--accent)] p-2 text-[10px] text-[var(--accent-foreground)]" aria-label="当前配色预览" style={currentAppearance.backgroundImage ? { backgroundImage: `linear-gradient(rgb(255 255 255 / 0.62), rgb(255 255 255 / 0.62)), url("${currentAppearance.backgroundImage}")`, backgroundPosition: `${currentAppearance.backgroundPositionX}% ${currentAppearance.backgroundPositionY}%`, backgroundRepeat: "no-repeat", backgroundSize: `${currentAppearance.backgroundScale}%` } : undefined}><div className="flex items-center justify-between"><span>当前主题预览</span><span className="rounded-md bg-[var(--primary)] px-2 py-1 text-[var(--primary-foreground)]">发送</span></div><span className="chat-bubble mt-1 block bg-white/75 px-2 py-1 text-slate-700">这是一条消息气泡</span></div>
          <div className="mb-1 mt-3 text-[10px] font-bold tracking-[0.1em] text-slate-400">一键主题方案</div>
          <div className="grid grid-cols-5 gap-1">{BUILTIN_AI_THEMES.map(theme => <button key={theme.id} onClick={() => applyBuiltInTheme(theme)} className="group rounded-lg px-1 pb-1 pt-1 text-center hover:bg-slate-100" aria-label={`应用${theme.name}主题与匹配滤镜`} title={`${theme.name}：${theme.note}，含匹配背景滤镜`}><span className="relative mx-auto block h-8 w-full overflow-hidden rounded-md ring-1 ring-black/5 transition-transform group-hover:scale-105" style={{ backgroundImage: "radial-gradient(circle at 72% 26%, rgb(255 245 214 / 0.95) 0 13%, transparent 14%), linear-gradient(135deg, rgb(244 202 142) 0%, rgb(106 157 191) 52%, rgb(30 41 59) 100%)", filter: `brightness(${theme.appearance.backgroundBrightness ?? 100}%) contrast(${theme.appearance.backgroundContrast ?? 100}%) saturate(${theme.appearance.backgroundSaturation ?? 100}%)` }}><span className="absolute inset-0" style={{ backgroundImage: `linear-gradient(${backgroundTemperatureOverlay(theme.appearance.backgroundTemperature)}, ${backgroundTemperatureOverlay(theme.appearance.backgroundTemperature)})`, mixBlendMode: "color" }} />{(theme.appearance.backgroundVignette ?? 0) > 0 && <span className="absolute inset-0" style={{ backgroundImage: backgroundVignetteOverlay(theme.appearance.backgroundVignette) }} />}{(theme.appearance.backgroundGrain ?? 0) > 0 && <span className="absolute inset-0 mix-blend-soft-light" style={{ backgroundImage: BACKGROUND_GRAIN_TEXTURE, opacity: (theme.appearance.backgroundGrain ?? 0) / 140 }} />}</span><span className="mt-1 block truncate text-[9px] text-slate-500">{theme.name}</span></button>)}</div>
          <div className="mb-1 mt-3 flex items-center justify-between text-[10px] font-bold tracking-[0.1em] text-slate-400"><span>气泡圆角</span><span>当前：{radiusOptions.find(option => option.value === bubbleRadius)?.label}</span></div>
          <div className="grid grid-cols-3 gap-1.5">{radiusOptions.map(option => <button key={option.value} onClick={() => updateActiveAppearance({ bubbleRadius: option.value })} className={`rounded-lg p-1.5 text-left ${bubbleRadius === option.value ? "bg-sky-100 text-sky-700 ring-1 ring-sky-200" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`} aria-label={`选择${option.label}气泡圆角`}><span className={`mb-1 flex h-8 w-full items-center justify-center bg-[var(--primary)] px-1 text-[10px] font-medium text-[var(--primary-foreground)] ${option.sampleClass}`}>你好</span><span className="block text-center text-[10px] font-bold">{option.label}</span><span className="block text-center text-[9px] opacity-70">{option.hint}</span></button>)}</div>
          <div className="mb-1 mt-3 text-[10px] font-bold tracking-[0.1em] text-slate-400">聊天背景</div><div className="grid grid-cols-4 gap-1">{([['plain','纯色'],['dots','圆点'],['grid','网格'],['paper','纸张']] as const).map(([value,label]) => <button key={value} onClick={() => updateActiveAppearance({ chatTexture: value })} className={`rounded-lg py-1 text-[10px] ${chatTexture === value ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"}`}>{label}</button>)}</div><div className="mb-1 mt-3 flex items-center gap-1 text-[10px] font-bold tracking-[0.1em] text-slate-400"><Type className="size-3" />字体大小</div><div className="grid grid-cols-3 gap-1"><button onClick={() => updateActiveAppearance({ fontScale: "small" })} className={`rounded-lg py-1 text-[11px] ${fontScale === "small" ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"}`}>小</button><button onClick={() => updateActiveAppearance({ fontScale: "medium" })} className={`rounded-lg py-1 text-[12px] ${fontScale === "medium" ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"}`}>标准</button><button onClick={() => updateActiveAppearance({ fontScale: "large" })} className={`rounded-lg py-1 text-sm ${fontScale === "large" ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"}`}>大</button></div>
          <input ref={backgroundInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={selectBackground} className="hidden" aria-label="选择自定义聊天背景" />
          <div className="mt-3 flex items-center gap-2"><button type="button" onClick={() => backgroundInputRef.current?.click()} disabled={isSavingBackground} className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60">{isSavingBackground ? "处理背景中…" : currentAppearance.backgroundImage ? "更换自定义背景" : "选择自定义背景"}</button>{currentAppearance.backgroundImage && <><button type="button" onClick={resetBackgroundLayout} className="rounded-lg px-2 py-1.5 text-[10px] font-medium text-sky-700 hover:bg-sky-50">重置布局</button><button type="button" onClick={() => updateActiveAppearance({ backgroundImage: undefined })} className="rounded-lg px-2 py-1.5 text-[10px] font-medium text-rose-600 hover:bg-rose-50">清除</button></>}</div>
          {currentAppearance.backgroundImage && <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold tracking-[0.08em] text-slate-500"><span>可视化裁切</span><span className="font-medium tracking-normal text-slate-400">拖动定位焦点</span></div>
              <div
                className="relative h-28 touch-none select-none overflow-hidden rounded-lg border border-slate-200 bg-slate-200 shadow-inner"
                role="application"
                aria-label="背景可视化裁切框，拖动可调整背景显示位置"
                onClick={updateCropPosition}
                onPointerDown={startCropDrag}
                onPointerMove={event => { if (cropDragRef.current) updateCropPosition(event); }}
                onPointerUp={stopCropDrag}
                onPointerCancel={stopCropDrag}
              >
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 scale-105" style={{ backgroundImage: `linear-gradient(${backgroundTemperatureOverlay(currentAppearance.backgroundTemperature)}, ${backgroundTemperatureOverlay(currentAppearance.backgroundTemperature)}), url("${currentAppearance.backgroundImage}")`, backgroundBlendMode: "color, normal", backgroundPosition: `${currentAppearance.backgroundPositionX}% ${currentAppearance.backgroundPositionY}%`, backgroundRepeat: "no-repeat", backgroundSize: `${currentAppearance.backgroundScale}%`, filter: `blur(${currentAppearance.backgroundBlur}px) brightness(${currentAppearance.backgroundBrightness}%) contrast(${currentAppearance.backgroundContrast}%) saturate(${currentAppearance.backgroundSaturation}%)` }} />
                {currentAppearance.backgroundGradientOpacity > 0 && <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: backgroundGradientOverlay(currentAppearance.backgroundGradientStart, currentAppearance.backgroundGradientEnd, currentAppearance.backgroundGradientOpacity, currentAppearance.backgroundGradientAngle) }} />}
                {currentAppearance.backgroundVignette > 0 && <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: backgroundVignetteOverlay(currentAppearance.backgroundVignette) }} />}
                {currentAppearance.backgroundGrain > 0 && <div aria-hidden="true" className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={{ backgroundImage: BACKGROUND_GRAIN_TEXTURE, opacity: currentAppearance.backgroundGrain / 140 }} />}
                <div className="pointer-events-none absolute inset-x-4 inset-y-3 rounded-md border-2 border-white/90 shadow-[0_0_0_999px_rgb(15_23_42/0.16)]">
                  <span className="absolute bottom-0 left-1/3 top-0 border-l border-dashed border-white/70" />
                  <span className="absolute bottom-0 left-2/3 top-0 border-l border-dashed border-white/70" />
                  <span className="absolute inset-x-0 top-1/3 border-t border-dashed border-white/70" />
                  <span className="absolute inset-x-0 top-2/3 border-t border-dashed border-white/70" />
                </div>
                <span className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900/35 shadow-sm" style={{ left: `${currentAppearance.backgroundPositionX}%`, top: `${currentAppearance.backgroundPositionY}%` }} />
                <span className="pointer-events-none absolute bottom-1 right-2 rounded bg-slate-950/55 px-1.5 py-0.5 text-[9px] font-medium text-white">拖动定位</span>
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold tracking-[0.08em] text-slate-500">布局预设</div>
              <div className="grid grid-cols-3 gap-1.5">{BACKGROUND_LAYOUT_PRESETS.map(preset => {
                const active = sameBackgroundLayout(currentAppearance, preset.layout);
                return <button key={preset.id} type="button" onClick={() => applyBackgroundLayout(preset)} className={`overflow-hidden rounded-lg border text-left transition ${active ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`} aria-pressed={active} aria-label={`应用${preset.name}背景布局`}>
                  <span className="block h-7 bg-slate-200" style={{ backgroundImage: `linear-gradient(rgb(15 23 42 / 0.15), rgb(15 23 42 / 0.15)), linear-gradient(${backgroundTemperatureOverlay(currentAppearance.backgroundTemperature)}, ${backgroundTemperatureOverlay(currentAppearance.backgroundTemperature)}), url("${currentAppearance.backgroundImage}")`, backgroundBlendMode: "normal, color, normal", backgroundPosition: `${preset.layout.backgroundPositionX}% ${preset.layout.backgroundPositionY}%`, backgroundRepeat: "no-repeat", backgroundSize: `${preset.layout.backgroundScale}%`, filter: `brightness(${currentAppearance.backgroundBrightness}%) contrast(${currentAppearance.backgroundContrast}%) saturate(${currentAppearance.backgroundSaturation}%)` }} />
                  <span className="block px-1.5 py-1 text-[9px] leading-tight text-slate-600"><b className="block text-slate-700">{preset.name}</b><span className="text-slate-400">{preset.note}</span></span>
                </button>;
              })}</div>
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.08em] text-slate-500"><span>背景滤镜</span><button type="button" onClick={resetBackgroundEffects} className="font-medium tracking-normal text-sky-700 hover:underline">一键重置效果</button></div>
            <div><div className="mb-1 text-[10px] font-bold tracking-[0.08em] text-slate-500">滤镜风格</div><div className="grid grid-cols-2 gap-1.5">{BACKGROUND_FILTER_PRESETS.map(preset => { const active = sameBackgroundFilter(currentAppearance, preset.filter); return <button key={preset.id} type="button" onClick={() => applyBackgroundFilter(preset)} className={`overflow-hidden rounded-lg border text-left transition ${active ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`} aria-pressed={active} aria-label={`应用${preset.name}背景滤镜`}><span className="block h-6 bg-slate-200" style={{ backgroundImage: `linear-gradient(${backgroundTemperatureOverlay(preset.filter.backgroundTemperature)}, ${backgroundTemperatureOverlay(preset.filter.backgroundTemperature)}), url("${currentAppearance.backgroundImage}")`, backgroundBlendMode: "color, normal", backgroundPosition: `${currentAppearance.backgroundPositionX}% ${currentAppearance.backgroundPositionY}%`, backgroundRepeat: "no-repeat", backgroundSize: `${currentAppearance.backgroundScale}%`, filter: `brightness(${preset.filter.backgroundBrightness}%) contrast(${preset.filter.backgroundContrast}%) saturate(${preset.filter.backgroundSaturation}%)` }} /><span className="block px-1.5 py-1 text-[9px] leading-tight text-slate-600"><b className="block text-slate-700">{preset.name}</b><span className="text-slate-400">{preset.note}</span></span></button>; })}</div></div>
            <div className="rounded-lg border border-slate-200 bg-white p-1.5"><div className="flex items-center justify-between text-[10px] font-bold tracking-[0.08em] text-slate-500"><span>我的滤镜组合</span><button type="button" onClick={() => { if (isFilterPresetEditorOpen) resetBackgroundFilterPresetEditor(); else setIsFilterPresetEditorOpen(true); }} className="font-medium tracking-normal text-sky-700 hover:underline">{isFilterPresetEditorOpen ? "收起" : "保存当前"}</button></div>{isFilterPresetEditorOpen && <div className="mt-1.5 flex gap-1"><input autoFocus value={filterPresetName} onChange={event => setFilterPresetName(event.target.value)} maxLength={20} placeholder="例如：夜读氛围" className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] outline-none focus:border-sky-300" /><button type="button" onClick={saveCurrentBackgroundFilterPreset} className="rounded-md bg-sky-600 px-2 text-[10px] font-medium text-white hover:bg-sky-700">{editingBackgroundFilterPresetId ? "更新" : "保存"}</button>{editingBackgroundFilterPresetId && <button type="button" onClick={resetBackgroundFilterPresetEditor} className="rounded-md px-1.5 text-[10px] text-slate-500 hover:bg-slate-100">取消</button>}</div>}{customBackgroundFilterPresets.length === 0 ? <p className="py-1.5 text-center text-[10px] text-slate-400">保存当前参数后，可在任何 AI 中复用</p> : <><p className="mt-1.5 text-[9px] text-slate-400">按住左侧手柄可排序；铅笔可重命名。</p><DndContext sensors={filterPresetSensors} collisionDetection={closestCenter} onDragEnd={reorderCustomBackgroundFilterPresets}><SortableContext items={customBackgroundFilterPresets.map(preset => preset.id)} strategy={verticalListSortingStrategy}><div className="mt-1 space-y-1">{customBackgroundFilterPresets.map(preset => <SortableBackgroundFilterPreset key={preset.id} preset={preset} onApply={() => applyBackgroundFilter(preset)} onRename={() => startRenameCustomBackgroundFilterPreset(preset)} onRemove={() => removeCustomBackgroundFilterPreset(preset.id)} />)}</div></SortableContext></DndContext></>}</div>
            <div className="rounded-lg border border-slate-200 bg-white p-1.5"><div className="mb-1 flex items-center justify-between text-[10px] font-bold tracking-[0.08em] text-slate-500"><span>渐变叠色层</span><span className="font-medium tracking-normal text-slate-400">{Math.round(currentAppearance.backgroundGradientOpacity * 100)}%</span></div><div className="mb-1.5 h-7 rounded-md border border-slate-200" aria-label="当前背景渐变叠色预览" style={{ backgroundImage: backgroundGradientOverlay(currentAppearance.backgroundGradientStart, currentAppearance.backgroundGradientEnd, Math.max(0.16, currentAppearance.backgroundGradientOpacity), currentAppearance.backgroundGradientAngle) }} /><div className="grid grid-cols-2 gap-2"><label className="flex items-center gap-1 text-[10px] font-medium text-slate-600">起始色<input aria-label="渐变起始颜色" type="color" value={currentAppearance.backgroundGradientStart} onChange={event => updateActiveAppearance({ backgroundGradientStart: event.target.value })} className="ml-auto size-5 cursor-pointer rounded border-0 bg-transparent p-0" /></label><label className="flex items-center gap-1 text-[10px] font-medium text-slate-600">结束色<input aria-label="渐变结束颜色" type="color" value={currentAppearance.backgroundGradientEnd} onChange={event => updateActiveAppearance({ backgroundGradientEnd: event.target.value })} className="ml-auto size-5 cursor-pointer rounded border-0 bg-transparent p-0" /></label></div><div className="mt-1.5 grid grid-cols-2 gap-2"><label className="block text-[10px] font-medium text-slate-600">叠色透明度 <span className="float-right text-slate-400">{Math.round(currentAppearance.backgroundGradientOpacity * 100)}%</span><input aria-label="渐变叠色透明度" type="range" min="0" max="0.7" step="0.05" value={currentAppearance.backgroundGradientOpacity} onChange={event => updateActiveAppearance({ backgroundGradientOpacity: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label><label className="block text-[10px] font-medium text-slate-600">渐变方向 <span className="float-right text-slate-400">{currentAppearance.backgroundGradientAngle}°</span><input aria-label="渐变方向" type="range" min="0" max="360" step="15" value={currentAppearance.backgroundGradientAngle} onChange={event => updateActiveAppearance({ backgroundGradientAngle: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label></div></div>
            <div className="grid grid-cols-2 gap-2"><label className="block text-[10px] font-medium text-slate-600">背景饱和度 <span className="float-right text-slate-400">{currentAppearance.backgroundSaturation}%</span><input aria-label="背景饱和度" type="range" min="0" max="200" step="5" value={currentAppearance.backgroundSaturation} onChange={event => updateActiveAppearance({ backgroundSaturation: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label><label className="block text-[10px] font-medium text-slate-600">色温 <span className="float-right text-slate-400">{(currentAppearance.backgroundTemperature ?? 0) > 0 ? `暖 ${currentAppearance.backgroundTemperature ?? 0}` : (currentAppearance.backgroundTemperature ?? 0) < 0 ? `冷 ${Math.abs(currentAppearance.backgroundTemperature ?? 0)}` : "中性"}</span><input aria-label="背景色温" type="range" min="-100" max="100" step="5" value={currentAppearance.backgroundTemperature ?? 0} onChange={event => updateActiveAppearance({ backgroundTemperature: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label></div>
            <div className="grid grid-cols-2 gap-2"><label className="block text-[10px] font-medium text-slate-600">背景暗角 <span className="float-right text-slate-400">{currentAppearance.backgroundVignette}%</span><input aria-label="背景暗角" type="range" min="0" max="100" step="5" value={currentAppearance.backgroundVignette} onChange={event => updateActiveAppearance({ backgroundVignette: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label><label className="block text-[10px] font-medium text-slate-600">背景颗粒 <span className="float-right text-slate-400">{currentAppearance.backgroundGrain}%</span><input aria-label="背景颗粒" type="range" min="0" max="100" step="5" value={currentAppearance.backgroundGrain} onChange={event => updateActiveAppearance({ backgroundGrain: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label></div>
            <div className="grid grid-cols-2 gap-2"><label className="block text-[10px] font-medium text-slate-600">背景模糊 <span className="float-right text-slate-400">{currentAppearance.backgroundBlur}px</span><input aria-label="背景模糊度" type="range" min="0" max="16" step="1" value={currentAppearance.backgroundBlur} onChange={event => updateActiveAppearance({ backgroundBlur: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label><label className="block text-[10px] font-medium text-slate-600">背景亮度 <span className="float-right text-slate-400">{currentAppearance.backgroundBrightness}%</span><input aria-label="背景亮度" type="range" min="60" max="140" step="5" value={currentAppearance.backgroundBrightness} onChange={event => updateActiveAppearance({ backgroundBrightness: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label><label className="block text-[10px] font-medium text-slate-600">背景对比度 <span className="float-right text-slate-400">{currentAppearance.backgroundContrast}%</span><input aria-label="背景对比度" type="range" min="60" max="160" step="5" value={currentAppearance.backgroundContrast} onChange={event => updateActiveAppearance({ backgroundContrast: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label><label className="block text-[10px] font-medium text-slate-600">文字保护层 <span className="float-right text-slate-400">{Math.round((currentAppearance.backgroundOpacity ?? 0.72) * 100)}%</span><input aria-label="背景文字保护层透明度" type="range" min="0.18" max="0.92" step="0.02" value={currentAppearance.backgroundOpacity ?? 0.72} onChange={event => updateActiveAppearance({ backgroundOpacity: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label></div><label className="block text-[10px] font-medium text-slate-600">背景缩放 <span className="float-right text-slate-400">{currentAppearance.backgroundScale}%</span><input aria-label="背景缩放比例" type="range" min="100" max="200" step="5" value={currentAppearance.backgroundScale} onChange={event => updateActiveAppearance({ backgroundScale: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label><div className="grid grid-cols-2 gap-2"><label className="block text-[10px] font-medium text-slate-600">水平位置 <span className="float-right text-slate-400">{currentAppearance.backgroundPositionX}%</span><input aria-label="背景水平位置" type="range" min="0" max="100" step="5" value={currentAppearance.backgroundPositionX} onChange={event => updateActiveAppearance({ backgroundPositionX: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label><label className="block text-[10px] font-medium text-slate-600">垂直位置 <span className="float-right text-slate-400">{currentAppearance.backgroundPositionY}%</span><input aria-label="背景垂直位置" type="range" min="0" max="100" step="5" value={currentAppearance.backgroundPositionY} onChange={event => updateActiveAppearance({ backgroundPositionY: Number(event.target.value) })} className="mt-1 w-full accent-sky-600" /></label></div>
          </div>}
        </div>
        <div className="mb-2 rounded-xl bg-white p-2 shadow-sm"><div className="flex items-center justify-between"><span className="text-[10px] font-bold tracking-[0.1em] text-slate-400">我的提示词</span><button type="button" onClick={() => { setIsPromptEditorOpen(open => !open); if (isPromptEditorOpen) resetPromptEditor(); }} className="text-[10px] font-medium text-sky-700 hover:underline">{isPromptEditorOpen ? "收起" : "管理"}</button></div>{isPromptEditorOpen && <div className="mt-2 space-y-2"><input value={promptTitle} onChange={event => setPromptTitle(event.target.value)} maxLength={24} placeholder="提示词名称，例如：周报整理" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-sky-300" /><textarea value={promptContent} onChange={event => setPromptContent(event.target.value)} maxLength={600} placeholder="输入点击后要填入对话框的内容" rows={3} className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-sky-300" /><div className="flex gap-2"><button type="button" onClick={savePromptShortcut} className="flex-1 rounded-lg bg-sky-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-700">{editingPromptId ? "更新提示词" : "添加提示词"}</button>{editingPromptId && <button type="button" onClick={resetPromptEditor} className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100">取消</button>}</div><div className="space-y-1">{customPromptShortcuts.length === 0 ? <p className="py-1 text-center text-[10px] text-slate-400">还没有自定义提示词</p> : customPromptShortcuts.map(item => <div key={item.id} className="flex items-center gap-1 rounded-lg bg-slate-50 p-1.5"><button type="button" onClick={() => editPromptShortcut(item)} className="min-w-0 flex-1 truncate text-left text-xs text-slate-700">{item.title}</button><button type="button" onClick={() => editPromptShortcut(item)} className="grid size-6 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700" aria-label={`编辑 ${item.title}`}><Pencil className="size-3" /></button><button type="button" onClick={() => removePromptShortcut(item.id)} className="grid size-6 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`删除 ${item.title}`}><Trash2 className="size-3" /></button></div>)}</div></div>}</div>
        <button onClick={() => { closeDrawer(); setLocation("/ais"); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-white"><Settings className="size-4 text-slate-400" /> 管理我的 AI <ChevronRight className="ml-auto size-4 text-slate-300" /></button>
        <button onClick={() => { closeDrawer(); setLocation("/profile"); }} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-white">
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
      {drawerMounted && <div className={`mobile-drawer fixed inset-0 z-50 isolate lg:hidden ${drawerOpen ? "is-open" : "is-closing"}`}><button onClick={closeDrawer} className="mobile-drawer-backdrop absolute inset-0 z-0 bg-slate-950/15" aria-label="关闭会话面板" />{conversationPanel}</div>}
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute -right-16 top-5 size-52 rounded-full bg-[#dceefa]/70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 size-56 rounded-full bg-[#f7dfe7]/60 blur-3xl" />
        <header className="relative z-10 flex h-16 shrink-0 items-center justify-between px-4 sm:px-7">
          <button onClick={openDrawer} className="grid size-10 place-items-center rounded-xl bg-white text-slate-600 shadow-sm lg:hidden" aria-label="打开会话面板"><Menu className="size-5" /></button>
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
              backgroundImage={currentAppearance.backgroundImage}
              backgroundBlur={currentAppearance.backgroundBlur}
              backgroundBrightness={currentAppearance.backgroundBrightness}
              backgroundContrast={currentAppearance.backgroundContrast}
              backgroundSaturation={currentAppearance.backgroundSaturation}
              backgroundTemperature={currentAppearance.backgroundTemperature}
              backgroundVignette={currentAppearance.backgroundVignette}
              backgroundGrain={currentAppearance.backgroundGrain}
              backgroundGradientStart={currentAppearance.backgroundGradientStart}
              backgroundGradientEnd={currentAppearance.backgroundGradientEnd}
              backgroundGradientOpacity={currentAppearance.backgroundGradientOpacity}
              backgroundGradientAngle={currentAppearance.backgroundGradientAngle}
              backgroundOpacity={currentAppearance.backgroundOpacity}
              backgroundScale={currentAppearance.backgroundScale}
              backgroundPositionX={currentAppearance.backgroundPositionX}
              backgroundPositionY={currentAppearance.backgroundPositionY}
              promptShortcuts={promptShortcuts}
              draftKey={`${activeAI?.id ?? "no-ai"}:${activeConversationId ?? "new"}`}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
