import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AIManager from "./pages/AIManager";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import { ThemeProvider } from "./contexts/ThemeContext";

function AppRoutes() {
  return <Switch><Route path="/" component={Home} /><Route path="/ais" component={AIManager} /><Route path="/settings" component={AIManager} /><Route path="/profile" component={Profile} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

function App() {
  const base = import.meta.env.BASE_URL === "/" ? "" : import.meta.env.BASE_URL.replace(/\/$/, "");
  return <ErrorBoundary><ThemeProvider><TooltipProvider><Toaster richColors position="top-center" /><WouterRouter base={base}><AppRoutes /></WouterRouter></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
