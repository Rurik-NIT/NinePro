import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEvent } from "./events.js";

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DeliveryResult { webhookId: string; status: number; durationMs: number; error?: string }

/** Recusa destinos internos (localhost, redes privadas, metadados de nuvem). */
function blockedTarget(endpoint: string): string | null {
  let u: URL;
  try { u = new URL(endpoint); } catch { return "Endereço inválido."; }
  if (u.protocol !== "https:") return "O endpoint precisa usar HTTPS.";
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return "Endereço interno não permitido.";
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === "::1" || /^f[cd]/.test(h) || h.startsWith("fe80")) return "Endereço interno não permitido.";
  return null;
}

/**
 * Envia um evento para os webhooks ativos do espaço que assinam esse evento.
 * POST JSON assinado: cabeçalho `X-NinePro-Signature: sha256=<hmac do corpo com o segredo do webhook>`.
 * Aguarda as entregas (timeout de 5s cada) porque funções serverless encerram ao responder.
 */
export async function dispatchEvent(sb: SupabaseClient, workspaceId: string, event: WebhookEvent, data: unknown, onlyWebhookId?: string): Promise<DeliveryResult[]> {
  let q = sb.from("webhooks").select("id, endpoint, events, active, signing_secret").eq("workspace_id", workspaceId);
  if (onlyWebhookId) q = q.eq("id", onlyWebhookId);
  const { data: hooks, error } = await q;
  if (error || !hooks) return [];
  const targets = onlyWebhookId ? hooks : hooks.filter((h) => h.active && (h.events as string[]).includes(event));
  const results = await Promise.all(targets.map(async (h): Promise<DeliveryResult> => {
    const deliveryId = crypto.randomUUID();
    const body = JSON.stringify({ id: deliveryId, evento: event, criado_em: new Date().toISOString(), espaco_id: workspaceId, dados: data });
    const started = Date.now();
    let status = 0;
    let err: string | undefined;
    try {
      const blocked = blockedTarget(h.endpoint as string);
      if (blocked) throw new Error(blocked);
      const signature = await hmacHex(h.signing_secret as string, body);
      const res = await fetch(h.endpoint as string, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "NinePro-Webhooks/1.0", "x-ninepro-event": event, "x-ninepro-delivery": deliveryId, "x-ninepro-signature": `sha256=${signature}` },
        body,
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
    } catch (e) {
      err = e instanceof Error ? (e.name === "TimeoutError" ? "Tempo esgotado (5s)" : e.message) : String(e);
    }
    const durationMs = Date.now() - started;
    await Promise.all([
      sb.from("webhook_deliveries").insert({ workspace_id: workspaceId, webhook_id: h.id, event, status, duration_ms: durationMs, error: err ?? null }),
      sb.from("webhooks").update({ last_delivery_at: new Date().toISOString(), last_status: status }).eq("id", h.id),
    ]);
    return { webhookId: h.id as string, status, durationMs, error: err };
  }));
  return results;
}
