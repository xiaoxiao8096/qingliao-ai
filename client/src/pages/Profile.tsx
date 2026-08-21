import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserProfile, imageFileToDataUrl, saveUserProfile } from "@/lib/localProfiles";
import { ArrowLeft, CheckCircle2, ImagePlus, UserRound } from "lucide-react";
import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Profile() {
  const [, setLocation] = useLocation();
  const stored = getUserProfile();
  const [name, setName] = useState(stored.name);
  const [avatar, setAvatar] = useState(stored.avatar);
  const input = useRef<HTMLInputElement>(null);

  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setAvatar(await imageFileToDataUrl(file)); } catch (error) { toast.error(error instanceof Error ? error.message : "头像处理失败。"); } finally { event.target.value = ""; }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = name.trim();
    if (!normalized) { toast.error("请填写你的名字。"); return; }
    saveUserProfile({ name: normalized, avatar });
    setName(normalized);
    toast.success("个人资料已保存在当前浏览器。");
  }

  return <main className="min-h-dvh bg-[#f3f6f8] px-4 py-5 sm:px-8 sm:py-8"><div className="mx-auto max-w-2xl"><header className="mb-7 flex items-center justify-between"><button onClick={() => setLocation("/")} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:text-slate-900"><ArrowLeft className="size-4" /> 返回对话</button><div className="flex size-10 items-center justify-center rounded-2xl bg-[#f7dfe7] text-[#9b5267]"><UserRound className="size-5" /></div></header><section className="rounded-[1.75rem] bg-white p-5 shadow-[0_16px_55px_rgba(43,58,72,0.08)] sm:p-9"><p className="text-xs font-bold tracking-[0.16em] text-slate-400">MY PROFILE · LOCAL ONLY</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">我的资料</h1><p className="mt-3 text-sm leading-6 text-slate-500">设置你在聊天气泡中显示的名字和头像，只保存到当前浏览器（本机本地）。</p><form onSubmit={submit} className="mt-8 space-y-6"><div className="flex items-center gap-4"><input ref={input} onChange={chooseAvatar} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" /><button type="button" onClick={() => input.current?.click()} className="grid size-20 place-items-center overflow-hidden rounded-[1.4rem] bg-[#f7dfe7] text-lg font-bold text-[#9b5267]">{avatar ? <img src={avatar} alt="我的头像" className="size-full object-cover" /> : name.slice(0, 1).toUpperCase()}</button><div><p className="font-semibold text-slate-700">我的头像</p><button type="button" onClick={() => input.current?.click()} className="mt-1 inline-flex items-center gap-1 text-sm text-[#4a86a8]"><ImagePlus className="size-3.5" />选择一张照片</button><p className="mt-1 text-xs text-slate-400">PNG、JPG 或 WebP，不超过 5MB</p></div></div><div className="space-y-2"><Label htmlFor="profile-name">我的名字</Label><Input id="profile-name" value={name} onChange={event => setName(event.target.value)} placeholder="例如 小林" className="h-11 rounded-xl border-slate-200 bg-slate-50/60" required /></div><Button type="submit" className="h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-700"><CheckCircle2 className="mr-2 size-4" />保存我的资料</Button></form></section></div></main>;
}
