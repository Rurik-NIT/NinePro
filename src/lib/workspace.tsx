import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { supabase } from "./supabase";

export interface Workspace { id: string; name: string; slug: string; role: "owner" | "admin" | "member" }
interface WorkspaceCtx {
  loading: boolean;
  workspaces: Workspace[];
  current: Workspace | null;
  profileName: string;
  select: (id: string) => void;
  rename: (name: string) => Promise<string | null>;
  reload: () => Promise<void>;
}
const Ctx = createContext<WorkspaceCtx | null>(null);
const KEY = "ninepro.workspace";

/** Espaços de trabalho do usuário logado (via workspace_members) e o espaço atual. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, mode } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(mode === "supabase");

  const userId = user?.id;
  const userEmail = user?.email;
  const reload = useCallback(async () => {
    if (!supabase || !userId) { setWorkspaces([]); setLoading(false); return; }
    setLoading(true);
    const [{ data: rows }, { data: prof }] = await Promise.all([
      supabase.from("workspace_members").select("role, workspaces(id, name, slug)").eq("user_id", userId),
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    const list = (rows ?? []).flatMap((r) => {
      const w = r.workspaces as unknown as { id: string; name: string; slug: string } | null;
      return w ? [{ ...w, role: r.role as Workspace["role"] }] : [];
    });
    setWorkspaces(list);
    setProfileName(prof?.full_name ?? userEmail ?? "");
    setLoading(false);
  }, [userId, userEmail]);

  useEffect(() => { void reload(); }, [reload]);

  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0] ?? null;
  const select = useCallback((id: string) => { setCurrentId(id); try { localStorage.setItem(KEY, id); } catch { /* ignora */ } }, []);
  const rename = useCallback(async (name: string) => {
    if (!supabase || !current) return "Sem espaço selecionado.";
    const { error } = await supabase.from("workspaces").update({ name }).eq("id", current.id);
    if (!error) await reload();
    return error?.message ?? null;
  }, [current, reload]);

  const value = useMemo(() => ({ loading, workspaces, current, profileName, select, rename, reload }), [loading, workspaces, current, profileName, select, rename, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWorkspace precisa de <WorkspaceProvider>");
  return c;
}
