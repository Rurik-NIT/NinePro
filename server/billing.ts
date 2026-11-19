/**
 * Cobrança por espaço de trabalho: teste grátis, limites do plano e assinatura pelo Stripe.
 * Variáveis (Vercel): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ESSENCIAL, STRIPE_PRICE_PROFISSIONAL, STRIPE_PRICE_AGENCIA.
 * Sem Stripe configurado, o super admin libera planos à mão (venda por Pix/boleto/contrato).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { billingActive, limitsOf, PLAN_BY_ID, trialDaysLeft, type PlanId, type PlanStatus, type WorkspaceBilling } from "../src/config/plans.js";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
export class BillingError extends Error { constructor(message: string, public code: "assinatura" | "limite" | "config" = "assinatura") { super(message); } }

const COLS = "plan, plan_status, trial_ends_at, current_period_end, stripe_customer_id, stripe_subscription_id";
export async function loadBilling(sb: SupabaseClient, ws: string): Promise<(WorkspaceBilling & { stripe_customer_id: string | null; stripe_subscription_id: string | null }) | null> {
  const { data, error } = await sb.from("workspaces").select(COLS).eq("id", ws).maybeSingle();
  if (error) return null; // colunas ainda não existem (migração pendente): não bloqueia
  return data as never;
}

/** Bloqueia ações que publicam, enviam ou conectam quando o teste acabou ou a assinatura foi cancelada. */
export async function requireActive(sb: SupabaseClient, ws: string) {
  const b = await loadBilling(sb, ws);
  if (billingActive(b)) return;
  throw new BillingError(b?.plan_status === "cancelado" ? "A assinatura deste espaço foi cancelada. Escolha um plano em Configurações › Faturamento para voltar a publicar e enviar." : "O teste grátis deste espaço terminou. Escolha um plano em Configurações › Faturamento para continuar publicando, enviando e conectando contas.");
}

/** Confere o limite do plano antes de conectar mais uma rede ou chamar mais uma pessoa. */
export async function requireLimit(sb: SupabaseClient, ws: string, kind: "connections" | "members", adding = 1, ignorePlatform?: string) {
  const b = await loadBilling(sb, ws);
  if (!b) return;
  const plan = limitsOf(b);
  let used = 0;
  if (kind === "connections") {
    let q = sb.from("platform_connections").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    if (ignorePlatform) q = q.neq("platform", ignorePlatform); // reconectar a mesma rede não conta de novo
    used = (await q).count ?? 0;
  } else used = (await sb.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;
  const max = kind === "connections" ? plan.connections : plan.members;
  if (used + adding > max) throw new BillingError(kind === "connections" ? `O plano ${plan.name} permite ${max} redes conectadas. Para conectar mais, mude de plano em Configurações › Faturamento.` : `O plano ${plan.name} permite ${max} pessoas na equipe. Para chamar mais, mude de plano em Configurações › Faturamento.`, "limite");
}

export async function billingStatus(sb: SupabaseClient, env: Env, ws: string) {
  const b = await loadBilling(sb, ws);
  const [{ count: connections }, { count: members }, { count: posts }] = await Promise.all([
    sb.from("platform_connections").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
    sb.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws),
    sb.from("posts").select("id", { count: "exact", head: true }).eq("workspace_id", ws).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);
  const plan = limitsOf(b);
  return {
    disponivel: !!b, plano: plan.id, nome_plano: plan.name, status: (b?.plan_status ?? "teste") as PlanStatus, ativo: billingActive(b), dias_de_teste: trialDaysLeft(b),
    teste_ate: b?.trial_ends_at ?? null, renova_em: b?.current_period_end ?? null, tem_assinatura: !!b?.stripe_subscription_id,
    uso: { conexoes: connections ?? 0, limite_conexoes: plan.connections, membros: members ?? 0, limite_membros: plan.members, publicacoes_no_mes: posts ?? 0 },
    stripe: stripeReady(env), contato_vendas: env.SALES_CONTACT || null,
  };
}

/* ------------------------------------------------------------------ Stripe (API REST, sem SDK) */
const PRICE_ENV: Record<Exclude<PlanId, "teste">, string> = { essencial: "STRIPE_PRICE_ESSENCIAL", profissional: "STRIPE_PRICE_PROFISSIONAL", agencia: "STRIPE_PRICE_AGENCIA" };
export const stripeReady = (env: Env) => !!env.STRIPE_SECRET_KEY && Object.values(PRICE_ENV).every((k) => !!env[k]);
const planOfPrice = (env: Env, price: string | undefined): PlanId | null => (Object.entries(PRICE_ENV).find(([, k]) => env[k] === price)?.[0] as PlanId | undefined) ?? null;

async function stripe<T = Json>(env: Env, path: string, form?: Record<string, string>, method = "POST"): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new BillingError("Pagamento on-line ainda não configurado.", "config");
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: form ? method : "GET", headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) }, body: form ? new URLSearchParams(form) : undefined, signal: AbortSignal.timeout(20_000) });
  const j = (await r.json().catch(() => ({}))) as Json & { error?: { message?: string } };
  if (!r.ok) throw new BillingError(`Stripe: ${j.error?.message ?? `HTTP ${r.status}`}`, "config");
  return j as T;
}

export async function createCheckout(sb: SupabaseClient, env: Env, ws: string, plan: string, email: string | undefined, origin: string) {
  if (!(plan in PRICE_ENV)) throw new BillingError("Plano inválido.", "config");
  if (!stripeReady(env)) throw new BillingError("Pagamento on-line ainda não configurado. Fale com o time de vendas para assinar.", "config");
  const b = await loadBilling(sb, ws);
  if (b?.stripe_subscription_id && b.plan_status !== "cancelado") throw new BillingError("Este espaço já tem uma assinatura. Use “Gerenciar assinatura” para trocar de plano ou de cartão.", "config");
  const s = await stripe<{ url: string }>(env, "checkout/sessions", {
    mode: "subscription", "line_items[0][price]": env[PRICE_ENV[plan as keyof typeof PRICE_ENV]]!, "line_items[0][quantity]": "1",
    success_url: `${origin}/faturamento?assinatura=ok`, cancel_url: `${origin}/faturamento`, client_reference_id: ws, locale: "pt-BR", allow_promotion_codes: "true",
    "subscription_data[metadata][workspace_id]": ws, "metadata[workspace_id]": ws,
    ...(b?.stripe_customer_id ? { customer: b.stripe_customer_id } : email ? { customer_email: email } : {}),
  });
  return { url: s.url };
}

export async function createPortal(sb: SupabaseClient, env: Env, ws: string, origin: string) {
  const b = await loadBilling(sb, ws);
  if (!b?.stripe_customer_id) throw new BillingError("Este espaço ainda não tem assinatura pelo cartão.", "config");
  const s = await stripe<{ url: string }>(env, "billing_portal/sessions", { customer: b.stripe_customer_id, return_url: `${origin}/faturamento` });
  return { url: s.url };
}

const STATUS_MAP: Record<string, PlanStatus> = { active: "ativo", trialing: "ativo", past_due: "atrasado", unpaid: "atrasado", incomplete: "atrasado", canceled: "cancelado", incomplete_expired: "cancelado", paused: "cancelado" };

/** Webhook do Stripe (assinatura conferida com STRIPE_WEBHOOK_SECRET). */
export async function handleStripeWebhook(req: Request, env: Env, sb: SupabaseClient | null): Promise<Response> {
  const reply = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  if (!env.STRIPE_WEBHOOK_SECRET || !sb) return reply(503, { error: "Webhook do Stripe não configurado." });
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  const expected = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${parts.t}.${raw}`).digest("hex");
  const given = sig.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const ok = given.some((g) => g.length === expected.length && timingSafeEqual(Buffer.from(g), Buffer.from(expected)));
  if (!ok || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return reply(400, { error: "Assinatura do webhook inválida." });
  const ev = JSON.parse(raw) as { type: string; data: { object: Json } };
  const o = ev.data.object;
  if (ev.type === "checkout.session.completed") {
    const ws = String(o.client_reference_id ?? (o.metadata as Json | undefined)?.workspace_id ?? "");
    if (ws) await sb.from("workspaces").update({ stripe_customer_id: o.customer as string, stripe_subscription_id: o.subscription as string, plan_status: "ativo" }).eq("id", ws);
  } else if (ev.type.startsWith("customer.subscription.")) {
    const ws = String((o.metadata as Json | undefined)?.workspace_id ?? "");
    const items = ((o.items as Json | undefined)?.data as { price?: { id?: string }; current_period_end?: number }[] | undefined) ?? [];
    const plan = planOfPrice(env, items[0]?.price?.id);
    const status = ev.type === "customer.subscription.deleted" ? "cancelado" : STATUS_MAP[String(o.status)] ?? "atrasado";
    const end = Number(o.current_period_end ?? items[0]?.current_period_end ?? 0);
    const row: Json = { plan_status: status, stripe_subscription_id: o.id, stripe_customer_id: o.customer, ...(plan ? { plan } : {}), ...(end ? { current_period_end: new Date(end * 1000).toISOString() } : {}) };
    const q = ws ? sb.from("workspaces").update(row).eq("id", ws) : sb.from("workspaces").update(row).eq("stripe_customer_id", String(o.customer));
    await q;
  } else if (ev.type === "invoice.payment_failed") {
    await sb.from("workspaces").update({ plan_status: "atrasado" }).eq("stripe_customer_id", String(o.customer));
  }
  return reply(200, { recebido: true });
}

/** Super admin: define plano e status à mão (venda por Pix, boleto ou contrato). */
export async function setPlanManually(sb: SupabaseClient, ws: string, p: { plan: string; status: string; until?: string | null; note?: string | null }) {
  if (!(p.plan in PLAN_BY_ID)) throw new BillingError("Plano inválido.", "config");
  if (!["teste", "ativo", "atrasado", "cancelado"].includes(p.status)) throw new BillingError("Status inválido.", "config");
  const until = p.until ? new Date(p.until) : null;
  if (until && Number.isNaN(until.getTime())) throw new BillingError("Data inválida.", "config");
  const row: Json = { plan: p.plan, plan_status: p.status, billing_note: p.note?.slice(0, 500) ?? null };
  if (p.status === "teste") row.trial_ends_at = (until ?? new Date(Date.now() + 14 * 86_400_000)).toISOString();
  else if (until) row.current_period_end = until.toISOString();
  const { error } = await sb.from("workspaces").update(row).eq("id", ws);
  if (error) throw new Error(error.message);
  return { ok: true };
}
