/**
 * Análises das publicações de todas as redes (mesma conta para a tela, o agente de IA e a API).
 * Engajamento = curtidas + comentários + compartilhamentos + salvamentos.
 * Melhor horário e frequência usam o desempenho RELATIVO de cada publicação (engajamento ÷ média da própria conta),
 * para comparar redes de tamanhos diferentes sem que a maior domine.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StatRow { channel_account_id: string; media_id: string; kind: string | null; caption: string | null; permalink: string | null; thumbnail?: string | null; media_type: string | null; posted_at: string | null; likes: number | null; comments: number | null; shares: number | null; saved: number | null; views: number | null; impressions: number | null; reach: number | null; clicks: number | null; post_id?: string | null }
export interface DailyRow { channel_account_id: string; day: string; kind: string; followers: number | null; impressions: number | null; reach: number | null; profile_views: number | null }
export interface AccInfo { id: string; name: string; kind: string; label: string }

const TZ = "America/Sao_Paulo";
const DAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const n = (v: unknown) => Number(v ?? 0) || 0;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const engagementOf = (r: StatRow) => n(r.likes) + n(r.comments) + n(r.shares) + n(r.saved);
const exposure = (r: StatRow) => (r.reach ?? null) ?? (r.impressions ?? null) ?? (r.views ?? null);
const local = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { wd, hour: Number(p.hour), date: `${p.year}-${p.month}-${p.day}` };
};
const weekStart = (date: string) => { const d = new Date(`${date}T12:00:00Z`); const wd = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - ((wd + 6) % 7)); return d.toISOString().slice(0, 10); };

export interface AnalyticsOpts { days: number; limit?: number; sortBy?: "engajamento" | "alcance" | "visualizacoes" | "curtidas" | "comentarios" | "salvamentos" | "compartilhamentos" | "impressoes" | "cliques" }

export function computeAnalytics(rows: StatRow[], daily: DailyRow[], accs: Map<string, AccInfo>, o: AnalyticsOpts) {
  const items = rows.filter((r) => r.posted_at).map((r) => ({ r, eng: engagementOf(r), exp: exposure(r) }));
  // média de engajamento por conta (base do desempenho relativo)
  const base = new Map<string, number>();
  for (const id of new Set(items.map((x) => x.r.channel_account_id))) { const l = items.filter((x) => x.r.channel_account_id === id); base.set(id, l.reduce((s, x) => s + x.eng, 0) / l.length || 0); }
  const scored = items.map((x) => ({ ...x, idx: base.get(x.r.channel_account_id) ? x.eng / base.get(x.r.channel_account_id)! : 0, at: local(x.r.posted_at!) }));
  const sum = (f: (r: StatRow) => number | null) => scored.reduce((s, x) => s + n(f(x.r)), 0);
  const totals = { curtidas: sum((r) => r.likes), comentarios: sum((r) => r.comments), compartilhamentos: sum((r) => r.shares), salvamentos: sum((r) => r.saved), visualizacoes: sum((r) => r.views), impressoes: sum((r) => r.impressions), alcance: sum((r) => r.reach), cliques: sum((r) => r.clicks), engajamento: scored.reduce((s, x) => s + x.eng, 0) };
  const expo = scored.filter((x) => x.exp);
  const rate = expo.length ? expo.reduce((s, x) => s + x.eng, 0) / expo.reduce((s, x) => s + n(x.exp), 0) : null;
  const avg = (list: typeof scored, f: (x: (typeof scored)[number]) => number) => (list.length ? r1(list.reduce((s, x) => s + f(x), 0) / list.length) : 0);
  const group = (key: (x: (typeof scored)[number]) => string) => {
    const m = new Map<string, typeof scored>();
    for (const x of scored) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); }
    return [...m.entries()].map(([grupo, l]) => ({ grupo, publicacoes: l.length, engajamento_medio: avg(l, (x) => x.eng), alcance_medio: avg(l, (x) => n(x.r.reach)), visualizacoes_medias: avg(l, (x) => n(x.r.views)), indice_medio: r3(l.reduce((s, x) => s + x.idx, 0) / l.length) })).sort((a, b) => b.engajamento_medio - a.engajamento_medio);
  };
  const porRede = [...new Set(scored.map((x) => x.r.kind ?? "instagram"))].map((k) => {
    const l = scored.filter((x) => (x.r.kind ?? "instagram") === k);
    const le = l.filter((x) => x.exp);
    return { rede: k, nome: [...accs.values()].find((a) => a.kind === k)?.label ?? k, publicacoes: l.length, engajamento: l.reduce((s, x) => s + x.eng, 0), engajamento_medio: avg(l, (x) => x.eng), visualizacoes: l.reduce((s, x) => s + n(x.r.views), 0), impressoes: l.reduce((s, x) => s + n(x.r.impressions), 0), alcance: l.reduce((s, x) => s + n(x.r.reach), 0), taxa_engajamento: le.length ? r3(le.reduce((s, x) => s + x.eng, 0) / le.reduce((s, x) => s + n(x.exp), 0)) : null };
  }).sort((a, b) => b.engajamento - a.engajamento);

  // melhor horário: mapa dia × hora com o índice médio (1 = média da conta)
  const mapa: { dia: number; nome_dia: string; hora: number; publicacoes: number; indice: number }[] = [];
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
    const l = scored.filter((x) => x.at.wd === d && x.at.hour === h);
    if (l.length) mapa.push({ dia: d, nome_dia: DAYS[d], hora: h, publicacoes: l.length, indice: r3(l.reduce((s, x) => s + x.idx, 0) / l.length) });
  }
  const confident = mapa.filter((m) => m.publicacoes >= 2);
  const melhores = (confident.length >= 3 ? confident : mapa).slice().sort((a, b) => b.indice - a.indice || b.publicacoes - a.publicacoes).slice(0, 3).map((m) => ({ dia: m.nome_dia, hora: `${String(m.hora).padStart(2, "0")}h`, publicacoes: m.publicacoes, desempenho: `${Math.round(m.indice * 100)}% da média` }));
  const porDia = DAYS.map((nome, d) => { const l = scored.filter((x) => x.at.wd === d); return { dia: nome, publicacoes: l.length, indice: l.length ? r3(l.reduce((s, x) => s + x.idx, 0) / l.length) : null }; });
  const porHora = Array.from({ length: 24 }, (_, h) => { const l = scored.filter((x) => x.at.hour === h); return { hora: h, publicacoes: l.length, indice: l.length ? r3(l.reduce((s, x) => s + x.idx, 0) / l.length) : null }; });

  // frequência × engajamento por semana
  const weeks = new Map<string, typeof scored>();
  for (const x of scored) { const w = weekStart(x.at.date); weeks.set(w, [...(weeks.get(w) ?? []), x]); }
  const semanas = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([semana, l]) => ({ semana, publicacoes: l.length, engajamento_medio: avg(l, (x) => x.eng), indice_medio: r3(l.reduce((s, x) => s + x.idx, 0) / l.length) }));
  let leitura: string | null = null;
  if (semanas.length >= 4) {
    const sorted = [...semanas].sort((a, b) => a.publicacoes - b.publicacoes);
    const mid = Math.floor(sorted.length / 2);
    const low = sorted.slice(0, mid), high = sorted.slice(mid);
    const li = low.reduce((s, w) => s + w.indice_medio, 0) / low.length, hi = high.reduce((s, w) => s + w.indice_medio, 0) / high.length;
    const lp = r1(low.reduce((s, w) => s + w.publicacoes, 0) / low.length), hp = r1(high.reduce((s, w) => s + w.publicacoes, 0) / high.length);
    leitura = hi >= li * 0.95 ? `Publicar mais não derrubou o desempenho: semanas com ~${hp} publicações renderam ${Math.round(hi * 100)}% da média por post, contra ${Math.round(li * 100)}% nas semanas com ~${lp}.` : `Nas semanas com mais publicações (~${hp}), cada post rendeu menos (${Math.round(hi * 100)}% da média) do que nas semanas com ~${lp} (${Math.round(li * 100)}%). Qualidade pode valer mais que quantidade.`;
  }

  // seguidores
  const byAcc = new Map<string, DailyRow[]>();
  for (const d of daily) byAcc.set(d.channel_account_id, [...(byAcc.get(d.channel_account_id) ?? []), d]);
  const seguidores = [...byAcc.entries()].map(([id, l]) => {
    const s = l.filter((x) => x.followers != null).sort((a, b) => a.day.localeCompare(b.day));
    const a = accs.get(id);
    return { conta_id: id, conta: a?.name ?? id, rede: a?.kind ?? s[0]?.kind ?? "", nome_rede: a?.label ?? "", atual: s.at(-1)?.followers ?? null, inicio: s[0]?.followers ?? null, ganho: s.length > 1 ? n(s.at(-1)!.followers) - n(s[0].followers) : null, serie: s.map((x) => ({ dia: x.day, seguidores: x.followers })) };
  }).filter((x) => x.atual != null).sort((a, b) => n(b.atual) - n(a.atual));
  const serieTotal = (() => {
    const days = [...new Set(daily.map((d) => d.day))].sort();
    const last = new Map<string, number>();
    return days.map((day) => { for (const d of daily) if (d.day === day && d.followers != null) last.set(d.channel_account_id, d.followers); return { dia: day, seguidores: [...last.values()].reduce((s, v) => s + v, 0) }; });
  })();

  const key: Record<string, (x: (typeof scored)[number]) => number> = { engajamento: (x) => x.eng, alcance: (x) => n(x.r.reach), visualizacoes: (x) => n(x.r.views), curtidas: (x) => n(x.r.likes), comentarios: (x) => n(x.r.comments), salvamentos: (x) => n(x.r.saved), compartilhamentos: (x) => n(x.r.shares), impressoes: (x) => n(x.r.impressions), cliques: (x) => n(x.r.clicks) };
  const sortFn = key[o.sortBy ?? "engajamento"] ?? key.engajamento;
  const ranked = [...scored].sort((a, b) => sortFn(b) - sortFn(a));
  const item = (x: (typeof scored)[number]) => ({ midia_id: x.r.media_id, rede: x.r.kind ?? "instagram", conta: accs.get(x.r.channel_account_id)?.name ?? null, formato: x.r.media_type ?? "—", publicada_em: x.r.posted_at, legenda: String(x.r.caption ?? "").slice(0, 280), link: x.r.permalink, thumbnail: x.r.thumbnail ?? null, curtidas: n(x.r.likes), comentarios: n(x.r.comments), compartilhamentos: x.r.shares, salvamentos: x.r.saved, visualizacoes: x.r.views, impressoes: x.r.impressions, alcance: x.r.reach, cliques: x.r.clicks, engajamento: x.eng, taxa_engajamento: x.exp ? r3(x.eng / n(x.exp)) : null, desempenho_relativo: r3(x.idx), feita_pelo_ninepro: !!x.r.post_id });
  const limit = o.limit ?? 10;
  return {
    periodo_dias: o.days, publicacoes: scored.length,
    totais: totals, taxa_engajamento: rate == null ? null : r3(rate),
    medias_por_publicacao: { engajamento: avg(scored, (x) => x.eng), alcance: avg(scored, (x) => n(x.r.reach)), visualizacoes: avg(scored, (x) => n(x.r.views)), curtidas: avg(scored, (x) => n(x.r.likes)), comentarios: avg(scored, (x) => n(x.r.comments)) },
    por_rede: porRede,
    por_formato: group((x) => x.r.media_type ?? "—"),
    por_dia_da_semana: porDia, por_horario: porHora,
    melhor_horario: { melhores, mapa, como_ler: "índice 1 = engajamento médio da própria conta; 1,5 = 50% acima. Horário de Brasília." },
    frequencia: { semanas, leitura },
    seguidores: { contas: seguidores, ganho_total: seguidores.reduce((s, x) => s + n(x.ganho), 0), serie_total: serieTotal },
    melhores: ranked.slice(0, limit).map(item),
    piores: ranked.length > limit ? ranked.slice(-Math.min(5, ranked.length - limit)).reverse().map(item) : [],
  };
}

/** Carrega do banco e calcula. kinds/accountId filtram. */
export async function loadAnalytics(sb: SupabaseClient, ws: string, o: AnalyticsOpts & { kinds?: string[]; accountId?: string; labels: Record<string, string> }) {
  const since = new Date(Date.now() - o.days * 86_400_000);
  let q = sb.from("social_media_stats").select("channel_account_id, media_id, kind, caption, permalink, thumbnail, media_type, posted_at, likes, comments, shares, saved, views, impressions, reach, clicks, post_id").eq("workspace_id", ws).gte("posted_at", since.toISOString()).order("posted_at", { ascending: false }).limit(3000);
  let dq = sb.from("account_stats_daily").select("channel_account_id, day, kind, followers, impressions, reach, profile_views").eq("workspace_id", ws).gte("day", since.toISOString().slice(0, 10)).order("day").limit(5000);
  if (o.kinds?.length) { q = q.in("kind", o.kinds); dq = dq.in("kind", o.kinds); }
  if (o.accountId) { q = q.eq("channel_account_id", o.accountId); dq = dq.eq("channel_account_id", o.accountId); }
  const [{ data: rows, error }, { data: daily }, { data: accRows }] = await Promise.all([q, dq, sb.from("channel_accounts").select("id, name, kind").eq("workspace_id", ws)]);
  if (error) throw new Error(error.message);
  const accs = new Map<string, AccInfo>((accRows ?? []).map((a) => [a.id as string, { id: a.id as string, name: a.name as string, kind: a.kind as string, label: o.labels[a.kind as string] ?? (a.kind as string) }]));
  return computeAnalytics((rows ?? []) as StatRow[], (daily ?? []) as DailyRow[], accs, o);
}
