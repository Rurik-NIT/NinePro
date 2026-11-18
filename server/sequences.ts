/**
 * Sequências de mensagens: uma série de mensagens com intervalo (ex.: boas-vindas agora, dica em 1 dia, oferta em 3 dias),
 * enviada pelo WhatsApp ou pelo Instagram para cada contato inscrito. Sai da sequência quando o contato responde (opcional).
 *  - Passos: texto (dentro da janela de 24 h) ou modelo aprovado do WhatsApp (a qualquer momento).
 *  - processSequences(): roda no cron de /api/publicar (a cada 5 minutos).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PlatformError } from "./platforms/index.js";
import { sendTemplate, sendToConversation } from "./channels.js";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
export interface Step { delay_minutes: number; kind: "texto" | "modelo"; text?: string; template_id?: string; params?: string[] }
export class SequenceError extends Error {}
const now = () => new Date().toISOString();
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const DAY = 86_400_000;

/** Valida e normaliza os passos. */
export function cleanSteps(raw: unknown, channelKind: string | null): Step[] {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > 20) throw new SequenceError("Até 20 passos por sequência.");
  return list.map((s, i) => {
    const o = s as Json;
    const kind = o.kind === "modelo" || o.tipo === "modelo" || o.template_id || o.modelo_id ? "modelo" : "texto";
    const delay = Math.round(Number(o.delay_minutes ?? o.esperar_minutos ?? 0));
    if (!Number.isFinite(delay) || delay < 0 || delay > 60 * 24 * 90) throw new SequenceError(`Passo ${i + 1}: intervalo inválido (0 a 90 dias, em minutos).`);
    if (kind === "modelo") {
      if (channelKind && channelKind !== "whatsapp") throw new SequenceError(`Passo ${i + 1}: modelos só existem no WhatsApp.`);
      const tid = String(o.template_id ?? o.modelo_id ?? "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(tid)) throw new SequenceError(`Passo ${i + 1}: escolha um modelo aprovado.`);
      return { delay_minutes: delay, kind, template_id: tid, params: (Array.isArray(o.params ?? o.variaveis) ? (o.params ?? o.variaveis) as unknown[] : []).map((x) => String(x).slice(0, 500)) };
    }
    const text = String(o.text ?? o.texto ?? "").trim().slice(0, 4096);
    if (!text) throw new SequenceError(`Passo ${i + 1}: escreva a mensagem.`);
    return { delay_minutes: delay, kind, text };
  });
}
const fill = (t: string, name: string) => { const n = name.startsWith("+") || name.startsWith("@") ? "" : name; return t.replace(/\{\{\s*nome\s*\}\}/gi, n).replace(/\{\{\s*primeiro_nome\s*\}\}/gi, n.split(" ")[0] ?? ""); };

export async function saveSequence(sb: SupabaseClient, ws: string, userId: string | null, p: Json) {
  const id = p.id ? String(p.id) : null;
  const existing = id ? (await sb.from("sequences").select("id, status, channel_account_id").eq("workspace_id", ws).eq("id", id).maybeSingle()).data : null;
  if (id && !existing) throw new SequenceError("Sequência não encontrada neste espaço.");
  const accountId = p.channel_account_id !== undefined ? (p.channel_account_id ? String(p.channel_account_id) : null) : (existing?.channel_account_id as string | null) ?? null;
  let kind: string | null = null;
  if (accountId) {
    const { data: acc } = await sb.from("channel_accounts").select("id, kind").eq("workspace_id", ws).eq("id", accountId).maybeSingle();
    if (!acc || !["whatsapp", "instagram"].includes(acc.kind as string)) throw new SequenceError("Escolha um número do WhatsApp ou uma conta do Instagram conectados.");
    kind = acc.kind as string;
  }
  const row: Json = { workspace_id: ws, updated_at: now() };
  if (p.name !== undefined) row.name = String(p.name).trim().slice(0, 120) || "Sequência";
  if (p.description !== undefined) row.description = String(p.description ?? "").slice(0, 500) || null;
  if (p.channel_account_id !== undefined) row.channel_account_id = accountId;
  if (p.exit_on_reply !== undefined) row.exit_on_reply = p.exit_on_reply !== false;
  if (p.steps !== undefined) {
    if (existing?.status === "ativa") throw new SequenceError("Pause a sequência antes de mudar os passos.");
    row.steps = cleanSteps(p.steps, kind);
    for (const s of row.steps as Step[]) if (s.kind === "modelo") {
      const { data: t } = await sb.from("wa_templates").select("status").eq("workspace_id", ws).eq("id", s.template_id!).maybeSingle();
      if (!t || t.status !== "APPROVED") throw new SequenceError("Use só modelos aprovados pela Meta.");
    }
  }
  if (p.source) row.source = String(p.source);
  const { data, error } = id
    ? await sb.from("sequences").update(row).eq("id", id).select("*").single()
    : await sb.from("sequences").insert({ name: "Sequência", ...row, created_by: userId }).select("*").single();
  if (error || !data) throw new SequenceError(error?.message ?? "Não foi possível salvar.");
  return data;
}

export async function setSequenceStatus(sb: SupabaseClient, ws: string, id: string, status: "ativa" | "pausada") {
  const { data: s } = await sb.from("sequences").select("id, steps, channel_account_id").eq("workspace_id", ws).eq("id", id).maybeSingle();
  if (!s) throw new SequenceError("Sequência não encontrada neste espaço.");
  if (status === "ativa" && !((s.steps as Step[]) ?? []).length) throw new SequenceError("Adicione ao menos um passo antes de ativar.");
  if (status === "ativa" && !s.channel_account_id) throw new SequenceError("Escolha o número do WhatsApp ou a conta do Instagram que envia.");
  await sb.from("sequences").update({ status, updated_at: now() }).eq("id", id);
  return { ok: true, status };
}

/** Inscreve conversas (ou números do WhatsApp) na sequência. Quem já está inscrito é ignorado. */
export async function enroll(sb: SupabaseClient, ws: string, sequenceId: string, who: { conversationIds?: string[]; phones?: { phone: string; name?: string }[] }) {
  const { data: seq } = await sb.from("sequences").select("id, status, steps, channel_account_id, channel_accounts(kind)").eq("workspace_id", ws).eq("id", sequenceId).maybeSingle();
  if (!seq) throw new SequenceError("Sequência não encontrada neste espaço.");
  const steps = (seq.steps as Step[]) ?? [];
  if (!steps.length) throw new SequenceError("A sequência não tem passos.");
  const first = new Date(Date.now() + steps[0].delay_minutes * 60_000).toISOString();
  const kind = (seq.channel_accounts as unknown as { kind?: string } | null)?.kind;
  const rows: Json[] = [];
  const convIds = [...new Set((who.conversationIds ?? []).map(String))].slice(0, 5000);
  if (convIds.length) {
    const { data: convs } = await sb.from("conversations").select("id, contact_name, channel_account_id").eq("workspace_id", ws).in("id", convIds);
    for (const c of convs ?? []) {
      if (seq.channel_account_id && c.channel_account_id !== seq.channel_account_id) continue;
      rows.push({ workspace_id: ws, sequence_id: sequenceId, conversation_id: c.id, contact_name: c.contact_name, next_run_at: first });
    }
  }
  const phones = (who.phones ?? []).map((p) => ({ phone: String(p.phone).replace(/\D/g, ""), name: p.name ? String(p.name).slice(0, 120) : null })).filter((p) => p.phone.length >= 10 && p.phone.length <= 15);
  if (phones.length) {
    if (kind !== "whatsapp") throw new SequenceError("Inscrição por número só em sequências do WhatsApp.");
    if (steps[0].kind !== "modelo") throw new SequenceError("Para inscrever números sem conversa, o primeiro passo precisa ser um modelo aprovado.");
    const seen = new Set<string>();
    for (const p of phones) {
      if (seen.has(p.phone)) continue; seen.add(p.phone);
      const { data: conv } = await sb.from("conversations").select("id, contact_name").eq("channel_account_id", seq.channel_account_id).eq("external_thread_id", p.phone).maybeSingle();
      rows.push(conv ? { workspace_id: ws, sequence_id: sequenceId, conversation_id: conv.id, contact_name: conv.contact_name, next_run_at: first } : { workspace_id: ws, sequence_id: sequenceId, phone: p.phone, contact_name: p.name ?? `+${p.phone}`, next_run_at: first });
    }
  }
  let added = 0;
  for (const r of rows) { const { error } = await sb.from("sequence_enrollments").insert(r); if (!error) added++; }
  const requested = convIds.length + new Set(phones.map((p) => p.phone)).size;
  return { inscritos: added, ignorados: requested - added, primeiro_envio: first };
}

export async function unenroll(sb: SupabaseClient, ws: string, enrollmentId: string, reason = "removido") {
  const { data } = await sb.from("sequence_enrollments").update({ status: "saiu", exit_reason: reason, next_run_at: null, updated_at: now() }).eq("workspace_id", ws).eq("id", enrollmentId).eq("status", "ativa").select("id");
  if (!data?.length) throw new SequenceError("Inscrição ativa não encontrada.");
  return { ok: true };
}

/** O contato respondeu: sai das sequências ativas que param na resposta. */
export async function exitOnReply(sb: SupabaseClient, conversationId: string) {
  const { data } = await sb.from("sequence_enrollments").select("id, sequences!inner(exit_on_reply)").eq("conversation_id", conversationId).eq("status", "ativa").eq("sequences.exit_on_reply", true);
  const ids = (data ?? []).map((e) => e.id as string);
  if (ids.length) await sb.from("sequence_enrollments").update({ status: "saiu", exit_reason: "respondeu", next_run_at: null, updated_at: now() }).in("id", ids);
  return ids.length;
}

/** Envia os passos vencidos (orçamento de tempo); o cron continua de onde parou. */
export async function processSequences(sb: SupabaseClient, env: Env, budgetMs: number) {
  const started = Date.now();
  let sent = 0, failed = 0;
  const { data: due } = await sb.from("sequence_enrollments").select("id, workspace_id, sequence_id, conversation_id, phone, contact_name, current_step, sequences!inner(id, status, steps, channel_account_id)").eq("status", "ativa").eq("sequences.status", "ativa").lte("next_run_at", now()).order("next_run_at").limit(200);
  for (const e of due ?? []) {
    if (Date.now() - started > budgetMs) break;
    const seq = e.sequences as unknown as { id: string; steps: Step[]; channel_account_id: string | null };
    const step = seq.steps[e.current_step as number];
    const ctx = { sb, env, ws: e.workspace_id as string, userId: null };
    // trava a inscrição antes de enviar (evita envio duplo se dois crons rodarem juntos)
    const { data: claim } = await sb.from("sequence_enrollments").update({ next_run_at: new Date(Date.now() + 10 * 60_000).toISOString() }).eq("id", e.id).eq("current_step", e.current_step).lte("next_run_at", now()).select("id");
    if (!claim?.length) continue;
    try {
      if (!step) throw new SequenceError("Passo não encontrado.");
      const name = String(e.contact_name ?? "");
      let convId = e.conversation_id as string | null;
      if (step.kind === "modelo") {
        let to = e.phone as string | null;
        if (!to && convId) to = ((await sb.from("conversations").select("external_thread_id").eq("id", convId).single()).data?.external_thread_id as string | null) ?? null;
        if (!to) throw new SequenceError("Contato sem número do WhatsApp.");
        const r = await sendTemplate(ctx, { templateId: step.template_id!, to, bodyParams: (step.params ?? []).map((p) => fill(p, name) || "cliente"), contactName: name, accountId: seq.channel_account_id ?? undefined });
        convId = r.conversationId;
        await sb.from("messages").update({ sequence_id: seq.id }).eq("conversation_id", convId).eq("external_id", r.id);
      } else {
        if (!convId) throw new SequenceError("Contato sem conversa: o primeiro passo precisa ser um modelo do WhatsApp.");
        await sendToConversation(ctx, convId, fill(step.text!, name));
        const { data: last } = await sb.from("messages").select("id").eq("conversation_id", convId).eq("direction", "out").order("sent_at", { ascending: false }).limit(1);
        if (last?.[0]) await sb.from("messages").update({ sequence_id: seq.id }).eq("id", last[0].id);
      }
      const nextIdx = (e.current_step as number) + 1;
      const next = seq.steps[nextIdx];
      await sb.from("sequence_enrollments").update(next
        ? { current_step: nextIdx, conversation_id: convId, phone: convId ? null : e.phone, next_run_at: new Date(Date.now() + next.delay_minutes * 60_000).toISOString(), last_error: null, updated_at: now() }
        : { current_step: nextIdx, conversation_id: convId, phone: convId ? null : e.phone, status: "concluida", next_run_at: null, last_error: null, updated_at: now() }).eq("id", e.id);
      sent++;
    } catch (err) {
      // fora da janela de 24 h: espera o próximo passo (se for modelo) ou encerra com o motivo
      const window = err instanceof PlatformError && /24 horas/.test(err.message);
      const nextIdx = (e.current_step as number) + 1;
      const next = seq.steps[nextIdx];
      if (window && next) await sb.from("sequence_enrollments").update({ current_step: nextIdx, next_run_at: new Date(Date.now() + next.delay_minutes * 60_000).toISOString(), last_error: `Passo ${nextIdx} pulado: ${msg(err)}`, updated_at: now() }).eq("id", e.id);
      else await sb.from("sequence_enrollments").update({ status: "falhou", next_run_at: null, last_error: msg(err).slice(0, 300), updated_at: now() }).eq("id", e.id);
      failed++;
    }
  }
  return { enviados: sent, falhas: failed };
}

/** Resumo de inscrições por sequência. */
export async function sequenceStats(sb: SupabaseClient, ids: string[]) {
  const stats: Record<string, { ativos: number; concluidos: number; sairam: number; falharam: number }> = {};
  if (!ids.length) return stats;
  const { data } = await sb.from("sequence_enrollments").select("sequence_id, status").in("sequence_id", ids).limit(50_000);
  for (const r of data ?? []) {
    const s = (stats[r.sequence_id as string] ??= { ativos: 0, concluidos: 0, sairam: 0, falharam: 0 });
    if (r.status === "ativa") s.ativos++; else if (r.status === "concluida") s.concluidos++; else if (r.status === "saiu") s.sairam++; else s.falharam++;
  }
  return stats;
}
export const DAY_MS = DAY;
