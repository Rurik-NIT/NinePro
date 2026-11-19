/**
 * Destinos de conversão: cada conversão recebida (tag do site ou API) é reenviada, do servidor, para a
 * API de Conversões da Meta e a Events API do TikTok, com o pixel e o token do próprio cliente.
 * E-mail e telefone vão com hash SHA-256 (como as plataformas exigem); o mesmo event_id evita contagem dupla com o pixel do navegador.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "./crypto.js";
import { metaVersion } from "./platforms/meta.js";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
export type DestPlatform = "meta" | "tiktok";
export const DEST_LABEL: Record<DestPlatform, string> = { meta: "Meta (Facebook e Instagram)", tiktok: "TikTok" };
export class DestinationError extends Error {}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const normEmail = (e?: string) => (e ? sha(e.trim().toLowerCase()) : undefined);
const normPhone = (p?: string) => { const d = (p ?? "").replace(/\D/g, ""); return d ? sha(d.length <= 11 ? `55${d}` : d) : undefined; };

const META_EVENT: Record<string, string> = { Compra: "Purchase", Lead: "Lead", Cadastro: "CompleteRegistration", "Adição ao carrinho": "AddToCart", "Início de checkout": "InitiateCheckout", Contato: "Contact", Agendamento: "Schedule", Assinatura: "Subscribe" };
const TIKTOK_EVENT: Record<string, string> = { Compra: "CompletePayment", Lead: "SubmitForm", Cadastro: "CompleteRegistration", "Adição ao carrinho": "AddToCart", "Início de checkout": "InitiateCheckout", Contato: "Contact", Agendamento: "Schedule", Assinatura: "Subscribe" };

export interface ConvForDelivery { id: string; type: string; value: number; received_at: string; page?: string | null; source: string; contact?: Record<string, string>; clickIds?: Record<string, string>; ip?: string | null; userAgent?: string | null; url?: string | null }

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const text = await r.text();
  let j: Json = {}; try { j = JSON.parse(text) as Json; } catch { j = { raw: text.slice(0, 200) }; }
  return { ok: r.ok, status: r.status, body: j };
}

async function sendMeta(env: Env, pixel: string, token: string, test: string | null, c: ConvForDelivery) {
  const custom = c.type in META_EVENT ? {} : { custom_event_name: c.type };
  const ud: Json = { em: normEmail(c.contact?.email), ph: normPhone(c.contact?.phone), fbc: c.clickIds?.fbc, fbp: c.clickIds?.fbp, client_ip_address: c.ip || undefined, client_user_agent: c.userAgent || undefined, external_id: c.clickIds?.visitor ? sha(c.clickIds.visitor) : undefined };
  const web = c.source === "Tag do site" && !!c.userAgent;
  const event = { event_name: META_EVENT[c.type] ?? c.type.replace(/\s+/g, ""), event_time: Math.floor(Date.parse(c.received_at) / 1000), event_id: c.id, action_source: web ? "website" : "system_generated", ...(web && c.url ? { event_source_url: c.url } : {}), user_data: Object.fromEntries(Object.entries(ud).filter(([, v]) => v)), custom_data: { currency: "BRL", ...(c.value ? { value: c.value } : {}), ...custom } };
  const r = await postJson(`https://graph.facebook.com/${metaVersion(env)}/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`, { data: [event], ...(test ? { test_event_code: test } : {}) });
  if (r.ok && Number(r.body.events_received ?? 0) > 0) return { ok: true };
  const e = r.body.error as { message?: string; error_user_msg?: string } | undefined;
  return { ok: false, error: e?.error_user_msg || e?.message || `HTTP ${r.status}` };
}

async function sendTiktok(pixel: string, token: string, test: string | null, c: ConvForDelivery) {
  const user: Json = { email: normEmail(c.contact?.email), phone: normPhone(c.contact?.phone), ttclid: c.clickIds?.ttclid, external_id: c.clickIds?.visitor ? sha(c.clickIds.visitor) : undefined, ip: c.ip || undefined, user_agent: c.userAgent || undefined };
  const event = { event: TIKTOK_EVENT[c.type] ?? c.type.replace(/\s+/g, ""), event_time: Math.floor(Date.parse(c.received_at) / 1000), event_id: c.id, user: Object.fromEntries(Object.entries(user).filter(([, v]) => v)), properties: { currency: "BRL", ...(c.value ? { value: c.value } : {}) }, ...(c.url ? { page: { url: c.url } } : {}) };
  const r = await postJson("https://business-api.tiktok.com/open_api/v1.3/event/track/", { event_source: "web", event_source_id: pixel, data: [event], ...(test ? { test_event_code: test } : {}) }, { "Access-Token": token });
  if (r.ok && Number(r.body.code ?? -1) === 0) return { ok: true };
  return { ok: false, error: String(r.body.message ?? `HTTP ${r.status}`) };
}

/** Reenvia a conversão para os destinos ativos do espaço e grava a resposta de cada um. */
export async function deliverConversion(sb: SupabaseClient, env: Env, ws: string, c: ConvForDelivery) {
  const { data: dests } = await sb.from("conversion_destinations").select("id, platform, pixel_id, token_enc, test_code, sent_count, error_count").eq("workspace_id", ws).eq("enabled", true);
  if (!dests?.length) return { enviada_para: [] as string[], entrega: {} };
  const delivery: Record<string, { ok: boolean; erro?: string; em: string }> = {};
  for (const d of dests) {
    let res: { ok: boolean; error?: string };
    try {
      const token = await decryptToken(env, d.token_enc as string);
      res = d.platform === "meta" ? await sendMeta(env, d.pixel_id as string, token, (d.test_code as string | null) ?? null, c) : await sendTiktok(d.pixel_id as string, token, (d.test_code as string | null) ?? null, c);
    } catch (e) { res = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
    delivery[d.platform as string] = { ok: res.ok, ...(res.error ? { erro: res.error.slice(0, 300) } : {}), em: new Date().toISOString() };
    await sb.from("conversion_destinations").update(res.ok ? { sent_count: ((d.sent_count as number) ?? 0) + 1, last_sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() } : { error_count: ((d.error_count as number) ?? 0) + 1, last_error: res.error?.slice(0, 500) ?? "erro", updated_at: new Date().toISOString() }).eq("id", d.id);
  }
  const ok = Object.entries(delivery).filter(([, v]) => v.ok).map(([k]) => k);
  const status = ok.length === dests.length ? "Aceito" : ok.length ? "Parcial" : "Rejeitado";
  await sb.from("conversion_events").update({ sent_to: ok, status, delivery }).eq("id", c.id);
  return { enviada_para: ok, entrega: delivery, status };
}

/** Salva (cria ou altera) o destino. Antes de salvar, manda um evento de teste para conferir pixel e token. */
export async function saveDestination(sb: SupabaseClient, env: Env, ws: string, userId: string, p: { platform: string; pixelId?: string; token?: string; testCode?: string; enabled?: boolean }) {
  if (p.platform !== "meta" && p.platform !== "tiktok") throw new DestinationError("Plataforma não suportada. Disponíveis: Meta e TikTok.");
  const platform = p.platform as DestPlatform;
  const { data: cur } = await sb.from("conversion_destinations").select("id, pixel_id, token_enc, test_code").eq("workspace_id", ws).eq("platform", platform).maybeSingle();
  const pixel = (p.pixelId ?? (cur?.pixel_id as string | undefined) ?? "").trim();
  if (!/^[A-Za-z0-9_-]{5,64}$/.test(pixel)) throw new DestinationError(platform === "meta" ? "Informe o ID do conjunto de dados (pixel) da Meta, só números." : "Informe o código do pixel do TikTok.");
  const token = p.token?.trim() || (cur?.token_enc ? await decryptToken(env, cur.token_enc as string) : "");
  if (token.length < 20) throw new DestinationError("Cole o token de acesso da API de conversões.");
  const testCode = p.testCode !== undefined ? (p.testCode.trim().slice(0, 40) || null) : ((cur?.test_code as string | null) ?? null);
  // confere com um evento de teste (com código de teste quando houver, para não contar como venda)
  const probe: ConvForDelivery = { id: `teste-${Date.now()}`, type: "Lead", value: 0, received_at: new Date().toISOString(), source: "API" };
  const r = platform === "meta" ? await sendMeta(env, pixel, token, testCode ?? "TEST00000", probe) : await sendTiktok(pixel, token, testCode ?? "TEST00000", probe);
  if (!r.ok) throw new DestinationError(`${DEST_LABEL[platform]} recusou o pixel ou o token: ${r.error}`);
  const row = { workspace_id: ws, platform, pixel_id: pixel, token_enc: await encryptToken(env, token), test_code: testCode, enabled: p.enabled ?? true, last_error: null, updated_at: new Date().toISOString() };
  const { error } = cur ? await sb.from("conversion_destinations").update(row).eq("id", cur.id) : await sb.from("conversion_destinations").insert({ ...row, created_by: userId });
  if (error) throw new Error(error.message);
  return { ok: true, plataforma: platform, pixel, teste: testCode };
}
