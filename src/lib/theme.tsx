import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";
const KEY = "ninepro.theme";

interface ThemeCtx { preference: ThemePreference; theme: ResolvedTheme; setPreference: (p: ThemePreference) => void; toggle: () => void; }
const Ctx = createContext<ThemeCtx | null>(null);

const read = (): ThemePreference => {
  try { const v = localStorage.getItem(KEY); if (v === "dark" || v === "light" || v === "system") return v; } catch { /* storage indisponível */ }
  return "dark";
};
const systemTheme = (): ResolvedTheme => (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(read);
  const [sys, setSys] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: light)");
    const on = () => setSys(mq.matches ? "light" : "dark");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const theme: ResolvedTheme = preference === "system" ? sys : preference;
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    try { localStorage.setItem(KEY, p); } catch { /* ignora */ }
  }, []);
  const toggle = useCallback(() => setPreference(theme === "dark" ? "light" : "dark"), [theme, setPreference]);

  const value = useMemo(() => ({ preference, theme, setPreference, toggle }), [preference, theme, setPreference, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme precisa de <ThemeProvider>");
  return c;
}
