import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type AccentColor = "sky" | "violet" | "rose" | "emerald" | "amber";
export type FontScale = "small" | "medium" | "large";
export type BubbleRadius = "soft" | "rounded" | "pill";
export type ChatTexture = "plain" | "dots" | "grid" | "paper";

const THEME_KEY = "qingliao.personal.theme.v1";
const ACCENT_KEY = "qingliao.personal.accent.v1";
const FONT_SCALE_KEY = "qingliao.personal.font-scale.v1";
const BUBBLE_RADIUS_KEY = "qingliao.personal.bubble-radius.v1";
const CHAT_TEXTURE_KEY = "qingliao.personal.chat-texture.v1";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
  accent: AccentColor;
  setAccent: (value: AccentColor) => void;
  fontScale: FontScale;
  setFontScale: (value: FontScale) => void;
  bubbleRadius: BubbleRadius;
  setBubbleRadius: (value: BubbleRadius) => void;
  chatTexture: ChatTexture;
  setChatTexture: (value: ChatTexture) => void;
  resetAppearance: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system", setPreference: () => undefined,
  accent: "sky", setAccent: () => undefined,
  fontScale: "medium", setFontScale: () => undefined,
  bubbleRadius: "rounded", setBubbleRadius: () => undefined,
  chatTexture: "plain", setChatTexture: () => undefined,
  resetAppearance: () => undefined,
});

function readPreference(): ThemePreference {
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}
function readAccent(): AccentColor {
  const saved = window.localStorage.getItem(ACCENT_KEY);
  return saved === "sky" || saved === "violet" || saved === "rose" || saved === "emerald" || saved === "amber" ? saved : "sky";
}
function readFontScale(): FontScale {
  const saved = window.localStorage.getItem(FONT_SCALE_KEY);
  return saved === "small" || saved === "medium" || saved === "large" ? saved : "medium";
}
function readBubbleRadius(): BubbleRadius {
  const saved = window.localStorage.getItem(BUBBLE_RADIUS_KEY);
  return saved === "soft" || saved === "rounded" || saved === "pill" ? saved : "rounded";
}
function readChatTexture(): ChatTexture {
  const saved = window.localStorage.getItem(CHAT_TEXTURE_KEY);
  return saved === "plain" || saved === "dots" || saved === "grid" || saved === "paper" ? saved : "plain";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => typeof window === "undefined" ? "system" : readPreference());
  const [accent, setAccent] = useState<AccentColor>(() => typeof window === "undefined" ? "sky" : readAccent());
  const [fontScale, setFontScale] = useState<FontScale>(() => typeof window === "undefined" ? "medium" : readFontScale());
  const [bubbleRadius, setBubbleRadius] = useState<BubbleRadius>(() => typeof window === "undefined" ? "rounded" : readBubbleRadius());
  const [chatTexture, setChatTexture] = useState<ChatTexture>(() => typeof window === "undefined" ? "plain" : readChatTexture());

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", preference === "dark" || (preference === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    window.localStorage.setItem(THEME_KEY, preference);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  useEffect(() => { document.documentElement.dataset.accent = accent; window.localStorage.setItem(ACCENT_KEY, accent); }, [accent]);
  useEffect(() => { document.documentElement.dataset.fontScale = fontScale; window.localStorage.setItem(FONT_SCALE_KEY, fontScale); }, [fontScale]);
  useEffect(() => { document.documentElement.dataset.bubbleRadius = bubbleRadius; window.localStorage.setItem(BUBBLE_RADIUS_KEY, bubbleRadius); }, [bubbleRadius]);
  useEffect(() => { document.documentElement.dataset.chatTexture = chatTexture; window.localStorage.setItem(CHAT_TEXTURE_KEY, chatTexture); }, [chatTexture]);

  const resetAppearance = () => {
    setAccent("sky");
    setFontScale("medium");
    setBubbleRadius("rounded");
    setChatTexture("plain");
  };

  return <ThemeContext.Provider value={{ preference, setPreference, accent, setAccent, fontScale, setFontScale, bubbleRadius, setBubbleRadius, chatTexture, setChatTexture, resetAppearance }}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() { return useContext(ThemeContext); }
