/**
 * Importação de publicações por CSV (como o bulk upload do Zernio, com prévia antes de criar).
 * Colunas (cabeçalho, em qualquer ordem; maiúsculas e acentos não importam):
 *   data        dd/mm/aaaa hh:mm ou aaaa-mm-dd hh:mm (horário de Brasília), ISO com fuso, "fila" ou vazio (= rascunho)
 *   texto       legenda / texto do post (obrigatório se não houver mídia)
 *   contas      @nome ou ID das contas, separados por | (opcional se houver "redes" ou contas padrão)
 *   redes       instagram, facebook, x, linkedin… (todas as contas dessas redes)
 *   midias      links https separados por | ou espaço
 *   titulo      título (YouTube, Pinterest)
 *   primeiro_comentario
 *   aprovacao   sim = manda para aprovação
 * Separador de colunas: vírgula ou ponto e vírgula (detectado pelo cabeçalho).
 */
import type { ChannelCtx } from "./channels.js";
import { channelLabel, checkPost, savePost } from "./channels.js";
import { PlatformError, PUBLISHABLE, type ChannelId } from "./platforms/index.js";
import { zonedToUtc } from "./queue.js";

const MAX_ROWS = 500;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const ALIASES: Record<string, string> = {
  data: "data", quando: "data", data_hora: "data", agendar_para: "data", scheduled_at: "data", scheduledfor: "data", scheduled_for: "data", date: "data",
  texto: "texto", legenda: "texto", conteudo: "texto", content: "texto", text: "texto", caption: "texto",
  contas: "contas", conta: "contas", accounts: "contas", account: "contas",
  redes: "redes", rede: "redes", platforms: "redes", platform: "redes",
  midias: "midias", midia: "midias", media: "midias", media_urls: "midias", imagens: "midias",
  titulo: "titulo", title: "titulo",
  primeiro_comentario: "primeiro_comentario", first_comment: "primeiro_comentario", comentario: "primeiro_comentario",
  aprovacao: "aprovacao", approval: "aprovacao", requires_approval: "aprovacao",
};
const KIND_ALIASES: Record<string, ChannelId> = { instagram: "instagram", ig: "instagram", facebook: "facebook", fb: "facebook", threads: "threads", linkedin: "linkedin_social", linkedin_social: "linkedin_social", youtube: "youtube", yt: "youtube", tiktok: "tiktok_social", tiktok_social: "tiktok_social", x: "x", twitter: "x", telegram: "telegram", discord: "discord", bluesky: "bluesky", pinterest: "pinterest", google: "google_business", google_business: "google_business", gbp: "google_business", google_meu_negocio: "google_business", slack: "slack" };

/** Parser de CSV com aspas (RFC 4180). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const head = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function parseWhen(raw: string): Date | "fila" | null | "invalida" {
  const s = raw.trim();
  if (!s) return null;
  if (/^fila$/i.test(s)) return "fila";
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2}):(\d{2})$/);
  if (m) return new Date(zonedToUtc("America/Sao_Paulo", +m[3], +m[2], +m[1], +m[4], +m[5]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return new Date(zonedToUtc("America/Sao_Paulo", +m[1], +m[2], +m[3], +m[4], +m[5]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? "invalida" : d;
}
const list = (s: string) => s.split(/\s*\|\s*|\s*;\s*|\s+(?=https:)/).map((x) => x.trim()).filter(Boolean);

export async function importPostsCsv(ctx: ChannelCtx, csv: string, opts: { dryRun: boolean; defaultAccountIds?: string[] }) {
  if (!csv.trim()) throw new PlatformError("Cole ou envie o conteúdo do CSV.");
  if (csv.length > 2_000_000) throw new PlatformError("CSV grande demais (máximo 2 MB).");
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new PlatformError("O CSV precisa do cabeçalho e de ao menos uma linha.");
  const cols = rows[0].map((h) => ALIASES[norm(h)] ?? null);
  if (!cols.includes("texto") && !cols.includes("midias")) throw new PlatformError("O cabeçalho precisa ter a coluna texto (ou midias). Colunas aceitas: data, texto, contas, redes, midias, titulo, primeiro_comentario, aprovacao.");
  const body = rows.slice(1);
  if (body.length > MAX_ROWS) throw new PlatformError(`No máximo ${MAX_ROWS} linhas por importação.`);
  const { data: accs } = await ctx.sb.from("channel_accounts").select("id, name, kind, enabled").eq("workspace_id", ctx.ws).in("kind", PUBLISHABLE);
  const all = (accs ?? []) as { id: string; name: string; kind: ChannelId; enabled?: boolean }[];
  const byKey = new Map<string, string>();
  for (const a of all) { byKey.set(a.id, a.id); byKey.set(a.name.toLowerCase(), a.id); byKey.set(a.name.toLowerCase().replace(/^@/, ""), a.id); }
  const out: { linha: number; ok: boolean; erro?: string; quando?: string | null; modo?: string; contas?: string[]; id?: string; status?: string }[] = [];
  for (const [i, r] of body.entries()) {
    const linha = i + 2;
    const get = (k: string) => { const j = cols.indexOf(k); return j >= 0 ? (r[j] ?? "").trim() : ""; };
    const ids = new Set<string>(); const unknown: string[] = [];
    for (const c of list(get("contas"))) { const id = byKey.get(c.toLowerCase()) ?? byKey.get(c.toLowerCase().replace(/^@/, "")); if (id) ids.add(id); else unknown.push(c); }
    for (const k of list(get("redes"))) { const kind = KIND_ALIASES[norm(k)]; if (!kind) { unknown.push(k); continue; } for (const a of all) if (a.kind === kind && a.enabled !== false) ids.add(a.id); }
    if (!ids.size && !get("contas") && !get("redes")) for (const id of opts.defaultAccountIds ?? []) if (all.some((a) => a.id === id)) ids.add(id);
    if (unknown.length) { out.push({ linha, ok: false, erro: `Conta ou rede não encontrada: ${unknown.slice(0, 3).join(", ")}.` }); continue; }
    const when = parseWhen(get("data"));
    if (when === "invalida") { out.push({ linha, ok: false, erro: `Data inválida: "${get("data")}". Use dd/mm/aaaa hh:mm.` }); continue; }
    if (when instanceof Date && when.getTime() < Date.now() + 60_000) { out.push({ linha, ok: false, erro: "A data já passou." }); continue; }
    const mode = when === "fila" ? "fila" : when ? "agendar" : "rascunho";
    if (mode !== "rascunho" && !ids.size && mode !== "fila") { out.push({ linha, ok: false, erro: "Informe as contas ou as redes." }); continue; }
    const fc = get("primeiro_comentario");
    const accountIds = [...ids];
    const kinds = [...new Set(all.filter((a) => ids.has(a.id)).map((a) => a.kind))];
    const payload = {
      content: get("texto"), title: get("titulo") || undefined, mediaUrls: list(get("midias")), accountIds, mode,
      scheduledAt: when instanceof Date ? when.toISOString() : undefined,
      options: fc ? Object.fromEntries(kinds.map((k) => [k, { primeiro_comentario: fc }])) : undefined,
      requiresApproval: /^(sim|s|yes|true|1)$/i.test(get("aprovacao")),
    };
    const contas = all.filter((a) => ids.has(a.id)).map((a) => `${channelLabel(a.kind)} ${a.name}`);
    if (opts.dryRun) {
      // valida sem gravar: usa as mesmas regras do salvamento
      const chk = mode === "rascunho" ? { ok: !!(payload.content || payload.mediaUrls.length), problemas: ["Linha sem texto e sem mídia."] } : checkPost(kinds, { text: payload.content, title: payload.title, mediaUrls: payload.mediaUrls, options: payload.options as never });
      out.push({ linha, ok: chk.ok, ...(chk.ok ? {} : { erro: chk.problemas.join(" ") }), quando: when instanceof Date ? when.toISOString() : null, modo: mode, contas });
      continue;
    }
    try {
      const r2 = await savePost(ctx, payload as never) as { id: string; status?: string };
      out.push({ linha, ok: true, id: r2.id, status: r2.status, quando: when instanceof Date ? when.toISOString() : null, modo: mode, contas });
    } catch (e) { out.push({ linha, ok: false, erro: e instanceof Error ? e.message : String(e), modo: mode, contas }); }
  }
  const validas = out.filter((x) => x.ok).length;
  return { simulacao: opts.dryRun, total: out.length, validas, invalidas: out.length - validas, linhas: out };
}
