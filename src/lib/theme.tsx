import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyTokens, DEFAULT_SPEC, normalizeSpec, sameSpec, tokensFor, type ThemeSpec } from "./themeEngine";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";
const KEY = "ninepro.theme";
const SPEC_KEY = "ninepro.theme.spec";

interface ThemeCtx {
  preference: ThemePreference; theme: ResolvedTheme; setPreference: (p: ThemePreference) => void; toggle: () => void;
  /** Cores em uso (do usuário ou da empresa). null = padrão do NinePro. */
  spec: ThemeSpec | null; setSpec: (s: ThemeSpec | null) => void;
  /** Prévia ao vivo no personalizador (não salva). null = sem prévia. */
  preview: { spec: ThemeSpec; mode?: ResolvedTheme } | null; setPreview: (p: { spec: ThemeSpec; mode?: ResolvedTheme } | null) => void;
}
const Ctx = createContext<ThemeCtx | null>(null);

const read = (): ThemePreference => {
  try { const v = localStorage.getItem(KEY); if (v === "dark" || v === "light" || v === "system") return v; } catch { /* storage indisponível */ }
  return "dark";
};
const readSpec = (): ThemeSpec | null => { try { const v = localStorage.getItem(SPEC_KEY); return v ? normalizeSpec(JSON.parse(v)) : null; } catch { return null; } };
const systemTheme = (): ResolvedTheme => (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(read);
  const [sys, setSys] = useState<ResolvedTheme>(systemTheme);
  const [spec, setSpecState] = useState<ThemeSpec | null>(readSpec);
  const [preview, setPreview] = useState<{ spec: ThemeSpec; mode?: ResolvedTheme } | null>(null);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: light)");
    const on = () => setSys(mq.matches ? "light" : "dark");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const theme: ResolvedTheme = preference === "system" ? sys : preference;
  const shown = preview?.mode ?? theme;
  useEffect(() => { document.documentElement.dataset.theme = shown; }, [shown]);
  // cores personalizadas por cima dos tokens (o padrão do NinePro fica com os valores do CSS, ajustados à mão)
  useEffect(() => {
    const s = preview?.spec ?? spec;
    applyTokens(s && !sameSpec(s, DEFAULT_SPEC) ? tokensFor(s, shown) : null);
  }, [spec, preview, shown]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    try { localStorage.setItem(KEY, p); } catch { /* ignora */ }
  }, []);
  const setSpec = useCallback((s: ThemeSpec | null) => {
    setSpecState(s);
    try { if (s) localStorage.setItem(SPEC_KEY, JSON.stringify(s)); else localStorage.removeItem(SPEC_KEY); } catch { /* ignora */ }
  }, []);
  const toggle = useCallback(() => setPreference(theme === "dark" ? "light" : "dark"), [theme, setPreference]);

  const value = useMemo(() => ({ preference, theme, setPreference, toggle, spec, setSpec, preview, setPreview }), [preference, theme, setPreference, toggle, spec, setSpec, preview]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme precisa de <ThemeProvider>");
  return c;
}
