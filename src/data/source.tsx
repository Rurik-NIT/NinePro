import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { sumTotals } from "@/config/metrics";
import * as demo from "./demo";
import * as extra from "./demo/extra";
import type { Campaign, DayPoint, DeliveryStatus, Lead, LeadStatus, PlatformId } from "./demo";
import type { ConvEvent } from "./demo/extra";

/**
 * Fonte de dados única das telas.
 *  - mode "demo": dados fictícios locais (sem Supabase configurado).
 *  - mode "supabase": dados do workspace atual, com RLS, mapeados para os MESMOS tipos usados pelas telas.
 */
export type Audience = (typeof extra.AUDIENCES)[number];
export type LeadForm = (typeof extra.LEAD_FORMS)[number];
export interface ApiKey { id: string; name: string; key: string; scope: string; status: "Ativa" | "Revogada"; permission: string; createdAt: Date; lastUsedAt?: Date | null }
export interface Webhook { id: string; name: string; endpoint: string; status: "Ativo" | "Pausado"; events: string[]; health: number; lastDelivery: Date | null; lastStatus?: number | null; secret?: string; deliveries?: number }
export interface AutomationRow { id: string; templateId: string; name: string; target: string; active: boolean; createdAt: string; condition?: string; action?: string }

interface DataCtx {
  mode: "demo" | "supabase";
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  campaigns: Campaign[];
  leads: Lead[];
  audiences: Audience[];
  leadForms: LeadForm[];
  convEvents: ConvEvent[];
  apiKeys: ApiKey[];
  webhooks: Webhook[];
  automations: AutomationRow[];
  refresh: () => Promise<void>;
  seedDemo: () => Promise<string | null>;
  setCampaignStatus: (ids: string[], status: DeliveryStatus) => Promise<string | null>;
  setLeadStatus: (id: string, status: LeadStatus) => Promise<string | null>;
  createAudience: (name: string, type: string) => Promise<string | null>;
  createApiKey: (name: string, permission: string) => Promise<{ secret?: string; error?: string }>;
  revokeApiKey: (id: string) => Promise<string | null>;
  createWebhook: (name: string, endpoint: string, events: string[]) => Promise<string | null>;
  toggleWebhook: (id: string) => Promise<string | null>;
  saveAutomation: (a: Omit<AutomationRow, "id" | "createdAt"> & { trigger?: unknown; conditions?: unknown; logic?: string; actions?: unknown }) => Promise<string | null>;
  toggleAutomation: (id: string, active: boolean) => Promise<string | null>;
  deleteAutomation: (id: string) => Promise<string | null>;
}
const Ctx = createContext<DataCtx | null>(null);

/* ---------------------------------------------------------------- utilitários */
const DAY = 86_400_000;
const HISTORY = 180;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const num = (v: unknown) => Number(v ?? 0);

/** Busca paginada (o PostgREST limita linhas por requisição). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------------------------------------------------------- provider */
export function DataProvider({ children }: { children: ReactNode }) {
  const { mode, user: authUser } = useAuth();
  const userId = authUser?.id;
  const user = useMemo(() => (userId ? { id: userId } : null), [userId]);
  const { current } = useWorkspace();
  const ws = current?.id;
  const [loading, setLoading] = useState(mode === "supabase");
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>(mode === "demo" ? demo.CAMPAIGNS : []);
  const [leads, setLeads] = useState<Lead[]>(mode === "demo" ? demo.LEADS : []);
  const [audiences, setAudiences] = useState<Audience[]>(mode === "demo" ? extra.AUDIENCES : []);
  const [leadForms, setLeadForms] = useState<LeadForm[]>(mode === "demo" ? extra.LEAD_FORMS : []);
  const [convEvents, setConvEvents] = useState<ConvEvent[]>(mode === "demo" ? extra.CONV_EVENTS : []);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(mode === "demo" ? (extra.API_KEYS as ApiKey[]) : []);
  const [webhooks, setWebhooks] = useState<Webhook[]>(mode === "demo" ? (extra.WEBHOOKS as Webhook[]) : []);
  const [automations, setAutomations] = useState<AutomationRow[]>([]);

  const refresh = useCallback(async () => {
    if (mode !== "supabase" || !supabase || !ws) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const since = iso(new Date(demo.TODAY.getTime() - (HISTORY - 1) * DAY));
      const [cRes, metrics, lRes, aRes, fRes, eRes, kRes, wRes, auRes] = await Promise.all([
        supabase.from("campaigns").select("id, name, objective, status, budget, budget_type, started_at, ad_accounts(name, platform), ad_sets(id, name, audience, status, ads(id, name, format, status))").eq("workspace_id", ws),
        fetchAll<Record<string, unknown>>((a, b) => supabase!.from("ad_metrics_daily").select("ad_id, date, spend, impressions, reach, clicks, link_clicks, conversions, leads, purchases, revenue").eq("workspace_id", ws).gte("date", since).order("date").range(a, b)),
        supabase.from("leads").select("id, name, email, status, submitted_at, platform, lead_forms(name), campaigns(name)").eq("workspace_id", ws).order("submitted_at", { ascending: false }).limit(1000),
        supabase.from("audiences").select("id, name, type, size, status, ad_accounts(name, platform)").eq("workspace_id", ws).order("created_at"),
        supabase.from("lead_forms").select("id, name, status, locale, created_at, platform, leads(count)").eq("workspace_id", ws).order("created_at"),
        supabase.from("conversion_events").select("id, type, source, sent_to, page, value, status, received_at, campaigns(name)").eq("workspace_id", ws).order("received_at", { ascending: false }).limit(500),
        supabase.from("api_keys").select("id, name, prefix, scope, permission, revoked_at, created_at, last_used_at").eq("workspace_id", ws).order("created_at", { ascending: false }),
        supabase.from("webhooks").select("id, name, endpoint, events, active, created_at, signing_secret, last_delivery_at, last_status, webhook_deliveries(status, created_at)").order("created_at", { referencedTable: "webhook_deliveries", ascending: false }).limit(50, { referencedTable: "webhook_deliveries" }).eq("workspace_id", ws).order("created_at", { ascending: false }),
        supabase.from("automations").select("id, name, template_id, target, status, created_at, conditions, actions").eq("workspace_id", ws).order("created_at"),
      ]);
      for (const r of [cRes, lRes, aRes, fRes, eRes, kRes, wRes, auRes]) if (r.error) throw new Error(r.error.message);

      // métricas por anúncio → por dia
      const byAd = new Map<string, Map<string, Omit<DayPoint, "date">>>();
      for (const m of metrics) {
        const map = byAd.get(m.ad_id as string) ?? new Map();
        map.set(m.date as string, { spend: num(m.spend), impressions: num(m.impressions), reach: num(m.reach), clicks: num(m.clicks), linkClicks: num(m.link_clicks), conversions: num(m.conversions), leads: num(m.leads), purchases: num(m.purchases), revenue: num(m.revenue) });
        byAd.set(m.ad_id as string, map);
      }
      const dates = Array.from({ length: HISTORY }, (_, i) => new Date(demo.TODAY.getTime() - (HISTORY - 1 - i) * DAY));
      const zero = sumTotals([]);
      const adTotal = (id: string) => sumTotals([...(byAd.get(id)?.values() ?? [])]).spend;

      type Row = { id: string; name: string; objective: Campaign["objective"]; status: DeliveryStatus; budget: number; budget_type: "diario" | "total"; started_at: string | null; ad_accounts: { name: string; platform: PlatformId } | null; ad_sets: { id: string; name: string; audience: string | null; status: DeliveryStatus; ads: { id: string; name: string; format: "Imagem" | "Vídeo" | "Carrossel"; status: DeliveryStatus }[] }[] };
      const mapped: Campaign[] = ((cRes.data ?? []) as unknown as Row[]).map((c) => {
        const adIds = c.ad_sets.flatMap((s) => s.ads.map((a) => a.id));
        const days: DayPoint[] = dates.map((d) => {
          const key = iso(d);
          return { date: d, ...sumTotals(adIds.map((id) => ({ ...zero, ...(byAd.get(id)?.get(key) ?? {}) }))) };
        });
        const campSpend = adIds.reduce((a, id) => a + adTotal(id), 0) || 1;
        return {
          id: c.id, name: c.name, platform: (c.ad_accounts?.platform ?? "meta") as PlatformId, account: c.ad_accounts?.name ?? "—",
          objective: c.objective, status: c.status, budget: num(c.budget), budgetType: c.budget_type,
          startedAt: c.started_at ? new Date(c.started_at) : new Date(), days,
          adSets: c.ad_sets.map((s) => {
            const setSpend = s.ads.reduce((a, ad) => a + adTotal(ad.id), 0);
            return {
              id: s.id, name: s.name, audience: s.audience ?? "", status: s.status, share: c.ad_sets.length === 1 ? 1 : setSpend / campSpend,
              ads: s.ads.map((ad) => ({ id: ad.id, name: ad.name, format: ad.format, status: ad.status, hue: hue(ad.id), share: s.ads.length === 1 ? 1 : (setSpend ? adTotal(ad.id) / setSpend : 1 / s.ads.length) })),
            };
          }),
        };
      });
      setCampaigns(mapped);

      setLeads((lRes.data ?? []).map((l: Record<string, unknown>) => ({
        id: l.id as string, name: l.name as string, email: (l.email as string) ?? "", status: l.status as LeadStatus, submittedAt: new Date(l.submitted_at as string),
        platform: ((l.platform as PlatformId) ?? "meta"), form: (l.lead_forms as { name: string } | null)?.name ?? "—", campaign: (l.campaigns as { name: string } | null)?.name ?? "—",
      })));
      setAudiences((aRes.data ?? []).map((a: Record<string, unknown>) => ({ id: a.id as string, name: a.name as string, type: a.type as string, size: num(a.size), status: a.status as string, account: (a.ad_accounts as { name: string } | null)?.name ?? "—", platform: ((a.ad_accounts as { platform: PlatformId } | null)?.platform ?? "meta") })));
      setLeadForms((fRes.data ?? []).map((f: Record<string, unknown>) => ({ id: f.id as string, name: f.name as string, status: f.status as string, locale: f.locale as string, createdAt: new Date(f.created_at as string), leads: num((f.leads as { count: number }[] | null)?.[0]?.count), platform: f.platform as PlatformId })));
      setConvEvents((eRes.data ?? []).map((e: Record<string, unknown>) => ({ id: (e.id as string).slice(0, 8), type: e.type as ConvEvent["type"], source: e.source as ConvEvent["source"], sentTo: (e.sent_to as PlatformId[]) ?? [], page: (e.page as string) ?? "—", campaign: (e.campaigns as { name: string } | null)?.name ?? "—", value: num(e.value), receivedAt: new Date(e.received_at as string), status: e.status as ConvEvent["status"] })));
      setApiKeys((kRes.data ?? []).map((k: Record<string, unknown>) => ({ id: k.id as string, name: k.name as string, key: k.prefix as string, scope: k.scope as string, permission: k.permission as string, status: k.revoked_at ? "Revogada" : "Ativa", createdAt: new Date(k.created_at as string), lastUsedAt: k.last_used_at ? new Date(k.last_used_at as string) : null })));
      setWebhooks((wRes.data ?? []).map((w: Record<string, unknown>) => ({ id: w.id as string, name: w.name as string, endpoint: w.endpoint as string, events: (w.events as string[]) ?? [], status: w.active ? "Ativo" : "Pausado", ...(() => { const d = (w.webhook_deliveries as { status: number }[] | null) ?? []; const ok = d.filter((x) => x.status >= 200 && x.status < 300).length; return { health: d.length ? (ok / d.length) * 100 : NaN, deliveries: d.length }; })(), lastDelivery: w.last_delivery_at ? new Date(w.last_delivery_at as string) : null, lastStatus: (w.last_status as number | null) ?? null, secret: w.signing_secret as string | undefined })));
      setAutomations((auRes.data ?? []).map((a: Record<string, unknown>) => ({ id: a.id as string, templateId: (a.template_id as string) ?? "custom", name: a.name as string, target: (a.target as string) ?? "—", active: a.status === "ativa", createdAt: a.created_at as string, condition: (a.conditions as { text?: string } | null)?.text, action: (a.actions as { text?: string } | null)?.text })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [mode, ws]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* ---------------------------------------------------------------- mutações */
  const run = useCallback(async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await fn();
    if (error) return error.message;
    await refresh();
    return null;
  }, [refresh]);

  const value = useMemo<DataCtx>(() => {
    const sb = supabase;
    const live = mode === "supabase" && !!sb && !!ws;
    return {
      mode, loading, error, isEmpty: live && !loading && campaigns.length === 0,
      campaigns, leads, audiences, leadForms, convEvents, apiKeys, webhooks, automations, refresh,
      seedDemo: async () => { if (!live) return "Sem banco conectado."; const { error } = await sb!.rpc("seed_demo_workspace", { ws }); if (error) return error.message; await refresh(); return null; },
      setCampaignStatus: async (ids, status) => {
        if (!live) return null;
        // Pelo servidor: além do banco, pausa/ativa na Meta quando a campanha veio de uma conta conectada.
        const token = (await sb!.auth.getSession()).data.session?.access_token;
        const res = await fetch("/api/connect", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "set_status", workspaceId: ws, ids, status }) }).catch(() => null);
        if (!res) return "Sem conexão com o servidor.";
        const r = (await res.json().catch(() => ({}))) as { error?: string; results?: { erro?: string }[] };
        await refresh();
        return r.error ?? r.results?.find((x) => x.erro)?.erro ?? null;
      },
      setLeadStatus: async (id, status) => (live ? run(() => sb!.from("leads").update({ status }).eq("id", id)) : null),
      createAudience: async (name, type) => (live ? run(() => sb!.from("audiences").insert({ workspace_id: ws, name, type, status: "Preenchendo" })) : null),
      createApiKey: async (name, permission) => {
        const rand = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
        const secret = `np_live_${rand}`;
        if (!live) return { secret };
        const { error } = await sb!.from("api_keys").insert({ workspace_id: ws, name, permission, prefix: `${secret.slice(0, 12)}…${secret.slice(-4)}`, key_hash: await sha256Hex(secret), created_by: user?.id });
        if (error) return { error: error.message };
        await refresh();
        return { secret };
      },
      revokeApiKey: async (id) => (live ? run(() => sb!.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id)) : null),
      createWebhook: async (name, endpoint, events) => (live ? run(() => sb!.from("webhooks").insert({ workspace_id: ws, name, endpoint, events })) : null),
      toggleWebhook: async (id) => { const w = webhooks.find((x) => x.id === id); return live && w ? run(() => sb!.from("webhooks").update({ active: w.status !== "Ativo" }).eq("id", id)) : null; },
      saveAutomation: async (a) => (live ? run(() => sb!.from("automations").insert({
        workspace_id: ws, name: a.name, template_id: a.templateId === "custom" ? null : a.templateId, target: a.target, status: a.active ? "ativa" : "rascunho",
        trigger: a.trigger ?? {}, logic: a.logic ?? "E", conditions: { text: a.condition, rows: a.conditions ?? [] }, actions: { text: a.action, items: a.actions ?? [] }, created_by: user?.id,
      })) : null),
      toggleAutomation: async (id, active) => (live ? run(() => sb!.from("automations").update({ status: active ? "ativa" : "desligada" }).eq("id", id)) : null),
      deleteAutomation: async (id) => (live ? run(() => sb!.from("automations").delete().eq("id", id)) : null),
    };
  }, [mode, loading, error, ws, user, campaigns, leads, audiences, leadForms, convEvents, apiKeys, webhooks, automations, refresh, run]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData precisa de <DataProvider>");
  return c;
}

/** Anúncios achatados (criativos) a partir das campanhas carregadas. */
export const flattenAds = (campaigns: Campaign[]) =>
  campaigns.flatMap((c) => c.adSets.flatMap((s) => s.ads.map((a) => ({ ...a, campaign: c, adSet: s, weight: s.share * a.share }))));
