/**
 * Fila de publicação: cada espaço define horários fixos na semana (ex.: seg/qua/sex às 09:00 e 18:00, no fuso de Brasília).
 * "Adicionar à fila" agenda a publicação no próximo horário livre. Ao mudar os horários, dá para reorganizar o que já está na fila.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Slot { day: number; time: string }
export interface Queue { id: string; workspace_id: string; name: string; timezone: string; slots: Slot[]; account_ids: string[]; active: boolean; is_default: boolean }
export const QUEUE_COLS = "id, workspace_id, name, timezone, slots, account_ids, active, is_default";
export class QueueError extends Error {}
const DAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Diferença (ms) entre o horário do fuso e o UTC naquele instante. */
function tzOffset(tz: string, at: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - at.getTime();
}
/** Data/hora local do fuso → instante UTC (trata horário de verão). */
export function zonedToUtc(tz: string, y: number, m: number, d: number, hh: number, mm: number) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffset(tz, new Date(guess));
  let t = guess - off;
  const off2 = tzOffset(tz, new Date(t));
  if (off2 !== off) t = guess - off2;
  return new Date(t);
}
function localDay(tz: string, at: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
export const validTz = (tz: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };

/** Limpa e ordena os horários (dia 0–6, HH:MM), sem repetidos. */
export function cleanSlots(raw: unknown): Slot[] {
  const list = (Array.isArray(raw) ? raw : []).map((s) => {
    const o = s as Record<string, unknown>;
    const day = Number(o.day ?? o.dia);
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(o.time ?? o.hora ?? "").trim());
    if (!Number.isInteger(day) || day < 0 || day > 6 || !m || +m[1] > 23 || +m[2] > 59) return null;
    return { day, time: `${m[1].padStart(2, "0")}:${m[2]}` };
  }).filter(Boolean) as Slot[];
  const seen = new Set<string>();
  return list.filter((s) => !seen.has(`${s.day}-${s.time}`) && seen.add(`${s.day}-${s.time}`)).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)).slice(0, 168);
}
export const describeSlots = (slots: Slot[]) => DAYS.map((d, i) => ({ dia: d, horarios: slots.filter((s) => s.day === i).map((s) => s.time) })).filter((x) => x.horarios.length);

/** Próximos horários da fila a partir de agora (sem considerar ocupação). */
export function upcoming(q: Pick<Queue, "timezone" | "slots">, count: number, from = new Date()) {
  const out: Date[] = [];
  if (!q.slots.length) return out;
  const min = from.getTime() + 60_000;
  for (let i = 0; i < 400 && out.length < count; i++) {
    const day = localDay(q.timezone, new Date(from.getTime() + i * 86_400_000));
    for (const s of q.slots.filter((x) => x.day === day.wd)) {
      const [hh, mm] = s.time.split(":").map(Number);
      const at = zonedToUtc(q.timezone, day.y, day.m, day.d, hh, mm);
      if (at.getTime() >= min && !out.some((o) => o.getTime() === at.getTime())) out.push(at);
      if (out.length >= count) break;
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
}

const minuteKey = (iso: string | Date) => new Date(iso).toISOString().slice(0, 16);
/** Horários livres (sem publicação agendada da mesma fila). */
export async function freeSlots(sb: SupabaseClient, q: Queue, count: number, ignorePostId?: string) {
  let pq = sb.from("posts").select("id, scheduled_at").eq("queue_id", q.id).eq("status", "agendada").gte("scheduled_at", new Date().toISOString());
  if (ignorePostId) pq = pq.neq("id", ignorePostId);
  const { data } = await pq;
  const taken = new Set((data ?? []).map((p) => minuteKey(p.scheduled_at as string)));
  return upcoming(q, count + taken.size + 5).filter((d) => !taken.has(minuteKey(d))).slice(0, count);
}

export async function loadQueue(sb: SupabaseClient, ws: string, queueId?: string | null): Promise<Queue> {
  let qq = sb.from("post_queues").select(QUEUE_COLS).eq("workspace_id", ws);
  qq = queueId ? qq.eq("id", queueId) : qq.eq("is_default", true);
  const { data } = await qq.maybeSingle();
  if (!data) throw new QueueError(queueId ? "Fila não encontrada neste espaço." : "Este espaço ainda não tem fila. Configure os horários em Publicações › Filas.");
  return { ...(data as Queue), slots: cleanSlots((data as Queue).slots) };
}

/** Escolhe o próximo horário livre para uma publicação. */
export async function nextQueueSlot(sb: SupabaseClient, ws: string, queueId?: string | null, ignorePostId?: string) {
  const q = await loadQueue(sb, ws, queueId);
  if (!q.active) throw new QueueError(`A fila “${q.name}” está pausada.`);
  if (!q.slots.length) throw new QueueError(`A fila “${q.name}” não tem horários. Configure em Publicações › Filas.`);
  const [slot] = await freeSlots(sb, q, 1, ignorePostId);
  if (!slot) throw new QueueError("Não há horário livre nos próximos meses nesta fila.");
  return { queue: q, at: slot };
}

/** Redistribui as publicações agendadas da fila nos horários atuais, mantendo a ordem. */
export async function reshuffle(sb: SupabaseClient, q: Queue) {
  const { data } = await sb.from("posts").select("id, scheduled_at").eq("queue_id", q.id).eq("status", "agendada").gte("scheduled_at", new Date().toISOString()).order("scheduled_at");
  const posts = data ?? [];
  if (!posts.length || !q.slots.length) return 0;
  const slots = upcoming(q, posts.length);
  let changed = 0;
  for (let i = 0; i < posts.length && i < slots.length; i++) {
    if (minuteKey(posts[i].scheduled_at as string) === minuteKey(slots[i])) continue;
    await sb.from("posts").update({ scheduled_at: slots[i].toISOString(), updated_at: new Date().toISOString() }).eq("id", posts[i].id);
    changed++;
  }
  return changed;
}

/** Cria ou altera uma fila. A primeira do espaço vira a padrão. */
export async function saveQueue(sb: SupabaseClient, ws: string, p: { id?: string; name?: string; timezone?: string; slots?: unknown; accountIds?: string[]; active?: boolean; setAsDefault?: boolean; reshuffle?: boolean }) {
  const tz = (p.timezone || "America/Sao_Paulo").trim();
  if (!validTz(tz)) throw new QueueError(`Fuso horário inválido: ${tz}.`);
  const row: Record<string, unknown> = { workspace_id: ws, timezone: tz, updated_at: new Date().toISOString() };
  if (p.name !== undefined) row.name = String(p.name).trim().slice(0, 80) || "Fila principal";
  if (p.slots !== undefined) row.slots = cleanSlots(p.slots);
  if (p.accountIds !== undefined) row.account_ids = p.accountIds.slice(0, 50);
  if (p.active !== undefined) row.active = p.active;
  const { count } = await sb.from("post_queues").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
  const makeDefault = p.setAsDefault === true || !count;
  if (makeDefault) await sb.from("post_queues").update({ is_default: false }).eq("workspace_id", ws).eq("is_default", true);
  if (makeDefault) row.is_default = true;
  const { data, error } = p.id
    ? await sb.from("post_queues").update(row).eq("workspace_id", ws).eq("id", p.id).select(QUEUE_COLS).maybeSingle()
    : await sb.from("post_queues").insert({ name: "Fila principal", ...row }).select(QUEUE_COLS).single();
  if (error) throw new QueueError(error.message);
  if (!data) throw new QueueError("Fila não encontrada neste espaço.");
  const q = { ...(data as Queue), slots: cleanSlots((data as Queue).slots) };
  const reorganizadas = p.reshuffle ? await reshuffle(sb, q) : 0;
  return { fila: q, proximos: (await freeSlots(sb, q, 5)).map((d) => d.toISOString()), reorganizadas };
}

export async function deleteQueue(sb: SupabaseClient, ws: string, id: string) {
  const { data } = await sb.from("post_queues").delete().eq("workspace_id", ws).eq("id", id).select("id, is_default");
  if (!data?.length) throw new QueueError("Fila não encontrada neste espaço.");
  if (data[0].is_default) {
    const { data: next } = await sb.from("post_queues").select("id").eq("workspace_id", ws).order("created_at").limit(1);
    if (next?.[0]) await sb.from("post_queues").update({ is_default: true }).eq("id", next[0].id);
  }
  return { ok: true };
}
