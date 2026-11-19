/**
 * Tema salvo no Supabase: o da empresa (workspace_themes, definido por dono/admin) e o de cada pessoa (user_themes).
 * Regra: a pessoa segue o tema da empresa, a menos que tenha escolhido o próprio (use_workspace = false).
 * O modo (claro/escuro/automático) é sempre da pessoa; sem escolha salva, vale o padrão da empresa.
 */
import { useCallback, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { useTheme, type ThemePreference } from "./theme";
import { useWorkspace } from "./workspace";
import { normalizeSpec, type ThemeSpec } from "./themeEngine";

export interface UserThemeRow { mode: ThemePreference; use_workspace: boolean; theme: unknown }
export interface WorkspaceThemeRow { theme: unknown; default_mode: ThemePreference }
export interface Resolved { spec: ThemeSpec | null; mode: ThemePreference | null; source: "pessoal" | "empresa" | "padrao" }

const hasColors = (t: unknown) => !!t && typeof t === "object" && Object.keys(t as object).length > 0;
export function resolveTheme(user: UserThemeRow | null, ws: WorkspaceThemeRow | null): Resolved {
  const mode = user?.mode ?? ws?.default_mode ?? null;
  if (user && !user.use_workspace && hasColors(user.theme)) return { spec: normalizeSpec(user.theme), mode, source: "pessoal" };
  if (ws && hasColors(ws.theme)) return { spec: normalizeSpec(ws.theme), mode, source: "empresa" };
  return { spec: null, mode, source: "padrao" };
}

export async function loadThemes(userId: string, wsId: string | null) {
  if (!supabase) return { user: null, ws: null };
  const [u, w] = await Promise.all([
    supabase.from("user_themes").select("mode, use_workspace, theme").eq("user_id", userId).maybeSingle(),
    wsId ? supabase.from("workspace_themes").select("theme, default_mode").eq("workspace_id", wsId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { user: (u.data as UserThemeRow | null) ?? null, ws: (w.data as WorkspaceThemeRow | null) ?? null };
}
export async function saveUserTheme(userId: string, row: Partial<UserThemeRow>) {
  if (!supabase) return { error: "Sem banco." };
  const { error } = await supabase.from("user_themes").upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return { error: error?.message ?? null };
}
export async function saveWorkspaceTheme(wsId: string, userId: string, row: Partial<WorkspaceThemeRow>) {
  if (!supabase) return { error: "Sem banco." };
  const { error } = await supabase.from("workspace_themes").upsert({ workspace_id: wsId, ...row, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
  return { error: error?.message ?? null };
}

/** Carrega o tema salvo ao entrar e ao trocar de espaço; vale em qualquer dispositivo. */
export function ThemeSync() {
  const { user, mode: authMode } = useAuth();
  const { current } = useWorkspace();
  const { setSpec, setPreference, preference } = useTheme();
  const saved = useRef<ThemePreference | null>(null);
  const current_pref = useRef(preference);
  current_pref.current = preference;
  const apply = useCallback(async () => {
    if (authMode !== "supabase" || !user) return;
    const { user: u, ws } = await loadThemes(user.id, current?.id ?? null);
    const r = resolveTheme(u, ws);
    setSpec(r.spec);
    saved.current = u?.mode ?? r.mode ?? current_pref.current;
    if (r.mode) setPreference(r.mode);
  }, [authMode, user, current?.id, setSpec, setPreference]);
  useEffect(() => { void apply(); }, [apply]);
  // claro/escuro/automático trocado em qualquer lugar (cabeçalho, perfil) fica salvo na conta
  useEffect(() => {
    if (authMode !== "supabase" || !user || saved.current === null || saved.current === preference) return;
    saved.current = preference;
    void saveUserTheme(user.id, { mode: preference });
  }, [preference, authMode, user]);
  useEffect(() => { if (authMode === "supabase" && !user) setSpec(null); }, [authMode, user, setSpec]);
  return null;
}
