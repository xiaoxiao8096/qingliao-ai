import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminUsers() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const users = trpc.admin.users.useQuery();
  const updateRole = trpc.admin.updateRole.useMutation();

  async function handleRoleChange(userId: number, role: "user" | "admin") {
    try {
      await updateRole.mutateAsync({ userId, role });
      await utils.admin.users.invalidate();
      toast.success("用户权限已更新。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "权限更新失败。");
    }
  }

  return (
    <main className="min-h-dvh bg-[#f3f6f8] px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:text-slate-900"><ArrowLeft className="size-4" /> 返回对话</button>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[#f7dfe7] text-[#9b5267]"><ShieldCheck className="size-5" /></div>
        </header>

        <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-[0_16px_55px_rgba(43,58,72,0.08)]">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div><p className="text-xs font-bold tracking-[0.16em] text-slate-400">ADMIN CONSOLE</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">用户管理</h1><p className="mt-2 text-sm text-slate-500">查看已登录的账户，并按需要调整管理员权限。</p></div>
            <div className="flex items-center gap-2 self-start rounded-2xl bg-[#f5f9fb] px-4 py-3 text-sm text-slate-600"><UsersRound className="size-4 text-[#4a86a8]" /><strong className="font-semibold text-slate-800">{users.data?.length ?? 0}</strong> 位用户</div>
          </div>

          {users.isLoading ? (
            <div className="grid min-h-64 place-items-center"><Loader2 className="size-5 animate-spin text-slate-400" /></div>
          ) : users.error ? (
            <div className="p-8 text-center text-sm text-rose-600">用户列表读取失败，请刷新后重试。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[#f8fafb] text-xs font-semibold tracking-wide text-slate-400"><tr><th className="px-8 py-4">用户</th><th className="px-5 py-4">登录方式</th><th className="px-5 py-4">最近登录</th><th className="px-8 py-4 text-right">角色</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {users.data?.map(account => (
                    <tr key={account.id} className="hover:bg-slate-50/60">
                      <td className="px-8 py-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-[#e1eff8] text-xs font-bold text-[#3f7698]">{account.name?.slice(0, 1).toUpperCase() ?? "U"}</span><span><span className="block font-semibold text-slate-800">{account.name || "未命名用户"}</span><span className="block max-w-56 truncate text-xs text-slate-400">{account.email || "未提供邮箱"}</span></span></div></td>
                      <td className="px-5 py-4 text-slate-500">{account.loginMethod || "Manus OAuth"}</td>
                      <td className="px-5 py-4 text-slate-500">{formatDate(account.lastSignedIn)}</td>
                      <td className="px-8 py-4 text-right"><select value={account.role} onChange={event => void handleRoleChange(account.id, event.target.value as "user" | "admin")} disabled={updateRole.isPending} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold outline-none ${account.role === "admin" ? "border-[#efcbd7] bg-[#fff4f7] text-[#9b5267]" : "border-slate-200 bg-white text-slate-600"}`} aria-label={`${account.name || "用户"} 的角色`}><option value="user">普通用户</option><option value="admin">管理员</option></select></td>
                    </tr>
                  ))}
                  {users.data?.length === 0 && <tr><td colSpan={4} className="px-8 py-14 text-center text-slate-400">尚无用户登录。</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mt-5 rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-500"><strong className="font-semibold text-slate-700">权限说明：</strong>管理员可访问本页面并调整其他用户角色。系统会阻止管理员移除自身的管理员权限，以避免失去后台访问权。</div>
      </div>
    </main>
  );
}
