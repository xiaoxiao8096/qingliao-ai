import type { CSSProperties } from "react";
import type { AIAppearance } from "./localProfiles";

export const previewAccentPalette: Record<AIAppearance["accent"], { primary: string; soft: string; ink: string }> = {
  sky: { primary: "#16698e", soft: "#dff2fb", ink: "#0f4f6c" },
  violet: { primary: "#6844ad", soft: "#eee8ff", ink: "#4f2d91" },
  rose: { primary: "#a94d63", soft: "#fbe8ee", ink: "#86364d" },
  emerald: { primary: "#277a5f", soft: "#e2f5eb", ink: "#176248" },
  amber: { primary: "#95621a", soft: "#fff1d5", ink: "#75480c" },
};

export function miniPreviewRadius(value: AIAppearance["bubbleRadius"]) {
  return value === "soft" ? "0.7rem 0.7rem 0.7rem 0.25rem" : value === "pill" ? "1.25rem" : "1rem 1rem 1rem 0.25rem";
}

export function miniPreviewTexture(appearance: AIAppearance): CSSProperties {
  const accent = previewAccentPalette[appearance.accent].primary;
  if (appearance.chatTexture === "dots") return { backgroundColor: "#f8fbfd", backgroundImage: "radial-gradient(rgba(71,85,105,.22) 1px, transparent 1.15px)", backgroundSize: "14px 14px" };
  if (appearance.chatTexture === "grid") return { backgroundColor: "#f8fbfd", backgroundImage: "linear-gradient(rgba(71,85,105,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(71,85,105,.14) 1px, transparent 1px)", backgroundSize: "17px 17px" };
  if (appearance.chatTexture === "paper") return { backgroundColor: "#fffefa", backgroundImage: `linear-gradient(120deg, ${accent}20, transparent 45%), repeating-linear-gradient(0deg, transparent, transparent 22px, rgba(100,116,139,.1) 23px)` };
  return { backgroundColor: "#f7fafc" };
}

const randomBubbleRadii: AIAppearance["bubbleRadius"][] = ["soft", "rounded", "pill"];
const randomTextures: AIAppearance["chatTexture"][] = ["plain", "dots", "grid", "paper"];
const randomFontScales: AIAppearance["fontScale"][] = ["small", "medium", "large"];

export function randomAppearanceStyle(random = Math.random): Pick<AIAppearance, "bubbleRadius" | "chatTexture" | "fontScale"> {
  const pick = <T,>(options: T[]) => options[Math.min(options.length - 1, Math.floor(random() * options.length))];
  return { bubbleRadius: pick(randomBubbleRadii), chatTexture: pick(randomTextures), fontScale: pick(randomFontScales) };
}
