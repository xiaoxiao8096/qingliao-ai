import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";
const THEME_KEY = "qingliao.personal.theme.v1";
const ThemeContext = createContext<{ preference: ThemePreference; setPreference: (value: ThemePreference) => void }>({ preference: "system", setPreference: () => undefined });

function readPreference(): ThemePreference {
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => typeof window === "undefined" ? "system" : readPreference());
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", preference === "dark" || (preference === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    window.localStorage.setItem(THEME_KEY, preference);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() { return useContext(ThemeContext); }
