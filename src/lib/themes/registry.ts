// Hook-free theme registry: safe to import from Server Components (layout.tsx).
/**
 * Card-inspired themes. Colours live in globals.css under :root[data-theme="<id>"];
 * an optional WebGL shader background lives in src/components/theme/shaders/<id>.ts.
 * The choice is a per-device preference stored in localStorage (so it can be applied
 * before first paint by the inline script in layout.tsx).
 */
export interface ThemeCredit {
  card: string; // e.g. "Origin Forme Palkia V"
  set: string; // e.g. "Astral Radiance"
  number: string; // e.g. "167/189"
  artist: string; // e.g. "Oswaldo KATO"
}

export interface ThemeMeta {
  id: string;
  name: string;
  mode: "dark" | "light";
  description: string;
  /** Browser UI colour (meta theme-color), should match --color-bg. */
  themeColor: string;
  /** A few colours for the picker preview: [bg, surface, accent, ...extras]. */
  swatches: string[];
  /** Whether a shader background exists for this theme. */
  shader: boolean;
  credit?: ThemeCredit;
}

export const THEMES: ThemeMeta[] = [
  {
    id: "default",
    name: "Midnight",
    mode: "dark",
    description: "The original MimiBinder look: deep navy with electric yellow.",
    themeColor: "#0a0c13",
    swatches: ["#0a0c13", "#131724", "#ffcb05", "#ef4444"],
    shader: false,
  },
  {
    id: "palkia",
    name: "Spatial Rift",
    mode: "light",
    description: "Parchment, pewter and slate ink with an orchid glow, drawn in cross-hatched lines.",
    themeColor: "#efe7dc",
    swatches: ["#efe7dc", "#faf6f0", "#9b4a86", "#2f4a68", "#aeb0b2"],
    shader: true,
    credit: { card: "Origin Forme Palkia V", set: "Astral Radiance", number: "167/189", artist: "Oswaldo KATO" },
  },
  {
    id: "giratina",
    name: "Star Requiem",
    mode: "dark",
    description: "Umber darkness with marbled gold flow lines, gold-leaf flecks and a touch of crimson.",
    themeColor: "#140b06",
    swatches: ["#140b06", "#24160d", "#e5b549", "#a8343f", "#8b6237"],
    shader: true,
    credit: { card: "Giratina VSTAR", set: "Crown Zenith", number: "GG69/GG70", artist: "Akira Egawa" },
  },
];

export const DEFAULT_THEME = "default";
export const THEME_STORAGE_KEY = "mimibinder:theme";
export const THEME_EVENT = "mimibinder:theme-change";

export function getThemeMeta(id: string | null | undefined): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function readTheme(): string {
  try {
    return getThemeMeta(localStorage.getItem(THEME_STORAGE_KEY)).id;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Applies a theme to <html> and the browser chrome. Safe to call repeatedly. */
export function applyTheme(id: string) {
  const meta = getThemeMeta(id);
  const root = document.documentElement;
  if (meta.id === DEFAULT_THEME) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", meta.id);
  root.style.colorScheme = meta.mode;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", meta.themeColor));
}

export function setTheme(id: string) {
  const meta = getThemeMeta(id);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, meta.id);
  } catch {
    /* private mode: still apply for this page view */
  }
  applyTheme(meta.id);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Inline script for <head>: applies the saved theme before first paint (no flash).
 * Keep it dependency-free; it runs before React.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=${JSON.stringify(
  Object.fromEntries(THEMES.map((t) => [t.id, [t.mode, t.themeColor]])),
)};var id=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var t=m[id];if(!t||id===${JSON.stringify(
  DEFAULT_THEME,
)})return;var r=document.documentElement;r.setAttribute("data-theme",id);r.style.colorScheme=t[0];}catch(e){}})();`;
