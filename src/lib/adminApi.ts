import { supabase } from "./supabase";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastSignInAt: string | null;
  confirmed: boolean;
  banned: boolean;
  isPlatformAdmin: boolean;
  workspaces: { id: string; name: string; role: string }[];
}
export interface AdminWorkspace { id: string; name: string; members: number }
export interface AuditEntry { id: number; actor_email: string | null; action: string; target_email: string | null; detail: Record<string, unknown>; created_at: string }

/** Chama o backend do super admin (/api/admin) com o token da sessão atual. */
export async function adminCall<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error("Banco não configurado.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  let res: Response;
  try {
    res = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) });
  } catch {
    throw new Error("Sem conexão com o servidor.");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Erro ${res.status}`);
  return body;
}
