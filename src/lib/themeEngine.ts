/**
 * Motor do tema personalizável: transforma as cores escolhidas (marca + interface) nos tokens semânticos
 * que o app já usa (src/styles/tokens.css) e confere o contraste (WCAG 2.1 AA).
 * Sem React: usado pelo ThemeProvider, pela tela do personalizador e pelos testes.
 */
export type Mode = "light" | "dark";
export interface BrandColors { primary: string; secondary: string; tertiary: string; accent: string }
export interface UiColors { background: string; sidebar: string; card: string; table: string; border: string; text: string }
export interface ThemeSpec { preset?: string; brand: BrandColors; light: UiColors; dark: UiColors }

/* ------------------------------------------------------------------ cor */
const HEX = /^#([0-9a-f]{6})$/i;
export const isHex = (s: unknown): s is string => typeof s === "string" && HEX.test(s);
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const; };
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
/** Mistura a com b (t = 0 → a, 1 → b). */
export const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
export const alpha = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = (hex: string) => { const [r, g, b] = rgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Texto legível sobre uma cor de fundo (preto suave ou branco). */
export const inkOn = (bg: string) => (contrast(bg, "#10140a") >= contrast(bg, "#ffffff") ? "#10140a" : "#ffffff");
/** Ajusta a cor (clareando ou escurecendo) até atingir o contraste mínimo contra o fundo. */
export function ensureContrast(fg: string, bg: string, min: number) {
  if (contrast(fg, bg) >= min) return fg;
  const target = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1; t += 0.05) { const c = mix(fg, target, t); if (contrast(c, bg) >= min) return c; }
  return target;
}

/* ------------------------------------------------------------------ predefinidos */
const DARK_BASE: UiColors = { background: "#0b0d0c", sidebar: "#121513", card: "#121513", table: "#171b19", border: "#232926", text: "#eef2ef" };
const LIGHT_BASE: UiColors = { background: "#f3f4f1", sidebar: "#ffffff", card: "#ffffff", table: "#f8f9f7", border: "#e1e4df", text: "#121513" };
export const PRESETS: { id: string; name: string; spec: ThemeSpec }[] = [
  { id: "ninepro", name: "NinePro (padrão)", spec: { preset: "ninepro", brand: { primary: "#c8f04b", secondary: "#3a87dd", tertiary: "#e0673a", accent: "#1fa886" }, light: LIGHT_BASE, dark: DARK_BASE } },
  { id: "oceano", name: "Oceano", spec: { preset: "oceano", brand: { primary: "#2f7cf6", secondary: "#14b8a6", tertiary: "#8b5cf6", accent: "#f59e0b" }, light: { ...LIGHT_BASE, background: "#f1f5fb", table: "#f5f8fd", border: "#dde5f0", text: "#0f1a2b" }, dark: { background: "#0a0f1a", sidebar: "#0f1726", card: "#0f1726", table: "#141e30", border: "#1f2b40", text: "#e8eef8" } } },
  { id: "floresta", name: "Floresta", spec: { preset: "floresta", brand: { primary: "#22a35a", secondary: "#0ea5e9", tertiary: "#d97706", accent: "#84cc16" }, light: { ...LIGHT_BASE, background: "#f2f6f2", table: "#f6f9f6", border: "#dce6dc", text: "#10201a" }, dark: { background: "#0a110d", sidebar: "#0f1913", card: "#0f1913", table: "#14211a", border: "#1f3027", text: "#e6f2ea" } } },
  { id: "ameixa", name: "Ameixa", spec: { preset: "ameixa", brand: { primary: "#7c4ddb", secondary: "#ec4899", tertiary: "#06b6d4", accent: "#f59e0b" }, light: { ...LIGHT_BASE, background: "#f6f3fa", table: "#f9f7fc", border: "#e6dff0", text: "#1c1328" }, dark: { background: "#0f0b16", sidebar: "#161021", card: "#161021", table: "#1d162b", border: "#2b2140", text: "#efe9f7" } } },
  { id: "coral", name: "Coral", spec: { preset: "coral", brand: { primary: "#f2603d", secondary: "#2563eb", tertiary: "#10b981", accent: "#facc15" }, light: { ...LIGHT_BASE, background: "#faf5f2", table: "#fcf8f6", border: "#efe2dc", text: "#2a1510" }, dark: { background: "#140c0a", sidebar: "#1c120f", card: "#1c120f", table: "#251814", border: "#3a2620", text: "#f7ece8" } } },
  { id: "grafite", name: "Grafite neutro", spec: { preset: "grafite", brand: { primary: "#e5e7eb", secondary: "#60a5fa", tertiary: "#f472b6", accent: "#34d399" }, light: { ...LIGHT_BASE, background: "#f4f4f5" }, dark: { background: "#09090b", sidebar: "#111113", card: "#111113", table: "#18181b", border: "#27272a", text: "#f4f4f5" } } },
  { id: "alto-contraste", name: "Alto contraste", spec: { preset: "alto-contraste", brand: { primary: "#ffd400", secondary: "#00b7ff", tertiary: "#ff5cf0", accent: "#00e676" }, light: { background: "#ffffff", sidebar: "#ffffff", card: "#ffffff", table: "#f2f2f2", border: "#000000", text: "#000000" }, dark: { background: "#000000", sidebar: "#000000", card: "#000000", table: "#111111", border: "#ffffff", text: "#ffffff" } } },
];
export const DEFAULT_SPEC = PRESETS[0].spec;

/** Valida e completa um tema vindo do banco ou do formulário (cores inválidas voltam ao padrão). */
export function normalizeSpec(raw: unknown): ThemeSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ThemeSpec>;
  const pick = <T extends object>(src: unknown, def: T): T => Object.fromEntries(Object.entries(def).map(([k, v]) => [k, isHex((src as Record<string, unknown> | undefined)?.[k]) ? ((src as Record<string, string>)[k]).toLowerCase() : v])) as T;
  return { preset: typeof r.preset === "string" ? r.preset.slice(0, 40) : undefined, brand: pick(r.brand, DEFAULT_SPEC.brand), light: pick(r.light, DEFAULT_SPEC.light), dark: pick(r.dark, DEFAULT_SPEC.dark) };
}
export const sameSpec = (a: ThemeSpec, b: ThemeSpec) => JSON.stringify({ ...a, preset: undefined }) === JSON.stringify({ ...b, preset: undefined });

/* ------------------------------------------------------------------ tokens */
/**
 * Cores → tokens do app. Mapeamento:
 *  primária   → acento (botão principal, item ativo, foco)        secundária → gráficos (série 1) e informação
 *  terciária  → gráficos (série 2)                                 destaque   → gráficos (série 3) e indicadores
 *  fundo → canvas · barra lateral → sidebar · cards → superfícies · tabelas → cabeçalho e linhas selecionadas
 *  bordas → linhas · textos → texto principal (os tons secundários são derivados misturando com o fundo)
 */
export function tokensFor(spec: ThemeSpec, mode: Mode): Record<string, string> {
  const ui = spec[mode]; const b = spec.brand;
  const dark = mode === "dark";
  const card = ui.card;
  const accentText = ensureContrast(b.primary, card, 4.5);
  return {
    "--canvas": ui.background,
    "--sidebar": ui.sidebar,
    "--surface": card,
    "--raised": dark ? mix(card, ui.text, 0.03) : card,
    "--surface-2": ui.table,
    "--table-head": ui.table,
    "--soft": mix(card, ui.text, dark ? 0.08 : 0.05),
    "--overlay": dark ? mix(card, ui.text, 0.02) : card,
    "--line": ui.border,
    "--line-soft": mix(ui.border, card, 0.4),
    "--line-strong": mix(ui.border, ui.text, 0.25),
    "--text": ui.text,
    "--text-soft": mix(ui.text, card, 0.2),
    "--text-muted": ensureContrast(mix(ui.text, card, 0.4), card, 4.5),
    "--text-dim": mix(ui.text, card, 0.55),
    "--text-inverse": card,
    "--accent": b.primary,
    "--accent-hover": mix(b.primary, dark ? "#ffffff" : "#000000", 0.12),
    "--accent-ink": inkOn(b.primary),
    "--accent-text": accentText,
    "--accent-tint": alpha(b.primary, dark ? 0.1 : 0.12),
    "--accent-line": alpha(b.primary, dark ? 0.24 : 0.34),
    "--accent-line-strong": alpha(b.primary, dark ? 0.44 : 0.6),
    "--focus-ring": alpha(b.primary, 0.55),
    "--info": ensureContrast(b.secondary, card, 3),
    "--series-1": b.secondary,
    "--series-2": b.tertiary,
    "--series-3": b.accent,
    "--chart-grid": mix(ui.border, card, 0.3),
    "--chart-axis": mix(ui.text, card, 0.55),
    "--bar-idle": mix(card, ui.text, dark ? 0.1 : 0.08),
    "--skeleton": mix(card, ui.text, 0.06),
    "--skeleton-shine": mix(card, ui.text, 0.1),
  };
}

/* ------------------------------------------------------------------ contraste */
export interface ContrastCheck { id: string; label: string; ratio: number; min: number; ok: boolean; fix?: string }
/** Pares que precisam ser legíveis. Texto normal: 4,5:1. Elementos de interface e texto grande: 3:1. */
export function contrastReport(spec: ThemeSpec, mode: Mode): ContrastCheck[] {
  const ui = spec[mode]; const b = spec.brand;
  const t = tokensFor(spec, mode);
  const pairs: [string, string, string, string, number, string?][] = [
    ["text-bg", "Texto sobre o fundo", ui.text, ui.background, 4.5, "Escureça ou clareie o texto ou o fundo."],
    ["text-card", "Texto sobre os cards", ui.text, ui.card, 4.5, "Ajuste a cor do texto ou dos cards."],
    ["text-sidebar", "Texto da barra lateral", ui.text, ui.sidebar, 4.5, "Ajuste a cor da barra lateral."],
    ["text-table", "Texto das tabelas", ui.text, ui.table, 4.5, "Ajuste a cor das tabelas."],
    ["muted-card", "Texto secundário sobre os cards", t["--text-muted"], ui.card, 4.5],
    ["ink-primary", "Texto do botão principal", t["--accent-ink"], b.primary, 4.5, "Escolha uma cor primária mais clara ou mais escura."],
    ["primary-card", "Cor primária como destaque nos cards", b.primary, ui.card, 3, "A cor primária quase some sobre os cards. Os textos em destaque usam uma versão ajustada automaticamente."],
    ["border-card", "Bordas visíveis sobre os cards", ui.border, ui.card, 1.2, "As bordas estão quase invisíveis."],
  ];
  return pairs.map(([id, label, fg, bg, min, fix]) => { const ratio = Math.round(contrast(fg, bg) * 100) / 100; return { id, label, ratio, min, ok: ratio >= min, ...(ratio < min && fix ? { fix } : {}) }; });
}

/* ------------------------------------------------------------------ aplicar */
const APPLIED = "data-custom-theme";
export function applyTokens(vars: Record<string, string> | null, el: HTMLElement = document.documentElement) {
  const prev = (el.getAttribute(APPLIED) ?? "").split(",").filter(Boolean);
  for (const k of prev) el.style.removeProperty(k);
  if (!vars) { el.removeAttribute(APPLIED); return; }
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.setAttribute(APPLIED, Object.keys(vars).join(","));
}
