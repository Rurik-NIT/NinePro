/**
 * Recebimento de conversões e visitas.
 *  - POST /api/eventos  (público, tag do site): { k: chave do site, e: evento, p: propriedades, v: visitante, url, ref, utm }
 *  - registerConversion(): usado também pela API de agentes (POST /api/v1/conversoes) para eventos do servidor do cliente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./connections.js";
import { dispatchEvent } from "./webhooks.js";
import { deliverConversion } from "./destinations.js";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" };
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : v == null ? "" : String(v).slice(0, max));

export const EVENT_TYPES: Record<string, string> = {
  purchase: "Compra", compra: "Compra", lead: "Lead", signup: "Cadastro", cadastro: "Cadastro", complete_registration: "Cadastro",
  add_to_cart: "Adição ao carrinho", carrinho: "Adição ao carrinho", initiate_checkout: "Início de checkout", checkout: "Início de checkout",
  contact: "Contato", contato: "Contato", schedule: "Agendamento", agendamento: "Agendamento", subscribe: "Assinatura", assinatura: "Assinatura",
};
export const typeLabel = (e: string) => EVENT_TYPES[e.toLowerCase()] ?? (e.charAt(0).toUpperCase() + e.slice(1)).slice(0, 60);

/** Grava uma conversão, atribui à campanha pela UTM (nome ou ID externo) e avisa os webhooks. */
/** env presente = reenvia aos destinos configurados (Meta, TikTok). */
export async function registerConversion(sb: SupabaseClient, ws: string, c: { type: string; value?: number; externalId?: string; source: string; page?: string; siteId?: string | null; visitorId?: string; utm?: Record<string, string>; contact?: Record<string, string>; campaignId?: string | null; clickIds?: Record<string, string>; ip?: string | null; userAgent?: string | null; url?: string | null }, env?: Env) {
  let campaignId = c.campaignId ?? null;
  const camp = c.utm?.campaign || c.utm?.id;
  if (!campaignId && camp) {
    const { data } = await sb.from("campaigns").select("id").eq("workspace_id", ws).or(`external_id.eq.${camp.replace(/[,()]/g, "")},name.ilike.${camp.replace(/[%,()]/g, "")}`).limit(1);
    campaignId = (data?.[0]?.id as string | undefined) ?? null;
  }
  const row = { workspace_id: ws, type: typeLabel(c.type), source: c.source, page: c.page || null, campaign_id: campaignId, value: Math.max(0, Math.round((Number(c.value) || 0) * 100) / 100), status: "Aceito", site_id: c.siteId ?? null, external_id: c.externalId || null, visitor_id: c.visitorId || null, utm: c.utm ?? {}, contact: c.contact ?? {}, click_ids: c.clickIds ?? {} };
  const { data, error } = c.externalId
    ? await sb.from("conversion_events").upsert(row, { onConflict: "workspace_id,external_id", ignoreDuplicates: true }).select("id, type, value, campaign_id, received_at")
    : await sb.from("conversion_events").insert(row).select("id, type, value, campaign_id, received_at");
  if (error) throw new Error(error.message);
  const saved = data?.[0] ?? null;
  if (saved) await dispatchEvent(sb, ws, "conversao.recebida", { ...saved, origem: c.source, utm: c.utm ?? {}, contato: c.contact ?? {} });
  // Lead com contato também entra na lista de Leads (com a campanha atribuída)
  if (saved && row.type === "Lead" && (c.contact?.email || c.contact?.phone)) {
    const { data: camp } = campaignId ? await sb.from("campaigns").select("ad_accounts(platform)").eq("id", campaignId).maybeSingle() : { data: null };
    const platform = (camp?.ad_accounts as unknown as { platform?: string } | null)?.platform ?? null;
    const { data: lead } = await sb.from("leads").insert({ workspace_id: ws, campaign_id: campaignId, platform, name: c.contact?.name || c.contact?.email || c.contact?.phone || "Lead", email: c.contact?.email || null, phone: c.contact?.phone || null }).select("id, name, email, phone, status, submitted_at").single();
    if (lead) await dispatchEvent(sb, ws, "lead.criado", { ...lead, origem: c.source });
  }
  const entrega = saved && env ? await deliverConversion(sb, env, ws, { id: saved.id as string, type: row.type, value: row.value, received_at: saved.received_at as string, page: row.page, source: c.source, contact: c.contact, clickIds: { ...(c.clickIds ?? {}), ...(c.visitorId ? { visitor: c.visitorId } : {}) }, ip: c.ip, userAgent: c.userAgent, url: c.url }).catch((e) => ({ erro: e instanceof Error ? e.message : String(e) })) : null;
  return { duplicada: !saved, conversao: saved, ...(entrega ? { destinos: entrega } : {}) };
}

const hostOk = (origin: string | null, domain: string) => {
  if (!origin) return true; // servidores e alguns navegadores não mandam Origin em POST simples
  try {
    const h = new URL(origin).hostname.replace(/^www\./, "");
    const d = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
    return h === d || h.endsWith(`.${d}`);
  } catch { return false; }
};

export async function handleIngest(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  const sb = serviceClient(env);
  if (!sb) return reply(503, { error: "indisponível" });
  let b: Json;
  try { b = JSON.parse((await req.text()).slice(0, 20_000)) as Json; } catch { return reply(400, { error: "JSON inválido." }); }
  const key = str(b.k, 64);
  if (!/^[0-9a-f]{32}$/.test(key)) return reply(400, { error: "Chave do site inválida." });
  const { data: site } = await sb.from("tracked_sites").select("id, workspace_id, domain, events_count").eq("public_key", key).maybeSingle();
  if (!site) return reply(404, { error: "Site não encontrado." });
  if (!hostOk(req.headers.get("origin"), site.domain as string)) return reply(403, { error: "Domínio não autorizado para esta chave." });
  const ev = str(b.e, 60) || "page_view";
  const p = (b.p ?? {}) as Json;
  const u = (b.utm ?? {}) as Json;
  const utm = Object.fromEntries(["source", "medium", "campaign", "content", "term", "id"].map((k) => [k, str(u[k], 200)]).filter(([, v]) => v)) as Record<string, string>;
  let path = "";
  try { const x = new URL(str(b.url, 1000)); path = x.pathname + (x.search ? "" : ""); } catch { /* sem URL */ }
  const ua = req.headers.get("user-agent") ?? "";
  if (ev === "page_view") {
    await sb.from("site_visits").insert({ workspace_id: site.workspace_id, site_id: site.id, visitor_id: str(b.v, 80) || null, path: path || null, referrer: str(b.ref, 500) || null, utm_source: utm.source ?? null, utm_medium: utm.medium ?? null, utm_campaign: utm.campaign ?? null, device: /mobi|android|iphone/i.test(ua) ? "Celular" : "Computador" });
  } else {
    const contact = Object.fromEntries(["email", "phone", "name"].map((k) => [k, str(p[k], 200)]).filter(([, v]) => v)) as Record<string, string>;
    const ids = (b.ids ?? {}) as Json;
    const clickIds = Object.fromEntries(["fbp", "fbc", "fbclid", "ttclid", "gclid"].map((k) => [k, str(ids[k], 300)]).filter(([, v]) => v)) as Record<string, string>;
    if (!clickIds.fbc && clickIds.fbclid) clickIds.fbc = `fb.1.${Date.now()}.${clickIds.fbclid}`;
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip");
    await registerConversion(sb, site.workspace_id as string, { type: ev, value: Number(p.value), externalId: str(p.id ?? p.order_id, 120), source: "Tag do site", page: path, siteId: site.id as string, visitorId: str(b.v, 80), utm, contact, clickIds, ip, userAgent: ua || null, url: str(b.url, 1000) || null }, env);
  }
  await sb.from("tracked_sites").update({ last_event_at: new Date().toISOString(), events_count: ((site.events_count as number) ?? 0) + 1 }).eq("id", site.id);
  return reply(200, { ok: true });
}
