import type { ChannelKind } from "@/config/networks";
import { supabase } from "./supabase";

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Banco não configurado.");
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Sem conexão com o servidor.");
  }
  const r = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(r.error ?? `Erro ${res.status}`);
  return r;
}

/** Conexões (OAuth, token, sincronização): /api/connect. */
export const connectCall = <T>(body: Record<string, unknown>) => post<T>("/api/connect", body);
/** WhatsApp e Instagram (enviar, responder, publicar): /api/canais. */
export const channelCall = <T>(body: Record<string, unknown>) => post<T>("/api/canais", body);

export interface ChannelAccount { id: string; kind: ChannelKind; name: string; display_name: string | null; picture_url: string | null; status: string; quality: string | null; detail: Record<string, unknown>; enabled: boolean; connection_id: string | null }
export const CHANNEL_ACCOUNT_COLS = "id, kind, name, display_name, picture_url, status, quality, detail, enabled, connection_id";

/** Endereço público dos webhooks (o mesmo domínio em que o app está aberto). */
export const webhookUrl = (key?: string | null) => `${window.location.origin}/api/canais-webhook${key ? `?conta=${key}` : ""}`;

/** URL assinada para anexos privados (bucket "anexos"); URLs externas passam direto. */
export async function attachmentUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  if (!supabase) return null;
  const { data } = await supabase.storage.from("anexos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
