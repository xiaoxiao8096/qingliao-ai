import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import AdminUsers from "./pages/AdminUsers";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#f3f6f8]">
        <Loader2 className="size-5 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#f3f6f8] px-5">
        <div className="absolute -left-20 top-16 size-56 rounded-full bg-[#dceefa] blur-3xl" />
        <div className="absolute -right-16 bottom-10 size-64 rounded-full bg-[#f7dfe7] blur-3xl" />
        <section className="relative w-full max-w-sm rounded-[2rem] bg-white/90 p-8 text-center shadow-[0_18px_60px_rgba(43,58,72,0.10)] backdrop-blur">
          <div className="mx-auto mb-6 grid size-12 place-items-center rounded-2xl bg-[#e1eff8] text-[#3f7698]">
            <Sparkles className="size-5" />
          </div>
          <p className="text-xs font-semibold tracking-[0.22em] text-slate-400">QINGLIAO AI</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">轻聊 AI</h1>
          <p className="mt-4 text-sm leading-6 text-slate-500">请登录后继续使用你的专属对话空间与模型设置。</p>
          <Button onClick={() => startLogin()} className="mt-7 h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-700">
            使用 Manus 登录
          </Button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}

function AdminGate() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <NotFound />;
  return <AdminUsers />;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <AuthGate><Home /></AuthGate>
      </Route>
      <Route path="/settings">
        <AuthGate><Settings /></AuthGate>
      </Route>
      <Route path="/admin/users">
        <AuthGate><AdminGate /></AuthGate>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
