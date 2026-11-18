/**
 * Canais: WhatsApp Business (Cloud API) e Instagram (mensagens diretas, comentários, menções e publicação).
 *  - POST /api/canais          (sessão do usuário): enviar mensagens e modelos, responder comentários, publicar
 *  - GET/POST /api/canais-webhook  (Meta): verificação e eventos recebidos. ?conta=<chave> quando o cliente usa o próprio app
 *  - GET /api/publicar         (Vercel Cron): publica o que estiver agendado
 * A conexão (OAuth / token) é a mesma das plataformas de anúncio (/api/connect, plataformas "whatsapp" e "instagram").
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAuth, loadOwnApp, serviceClient } from "./connections.js";
import { encryptToken } from "./crypto.js";
import { CHANNELS, graphemes, isChannel, isVideoUrl, PlatformError, PUBLISHABLE, type ChannelId, type StoredAuth } from "./platforms/index.js";
import { optList, optStr, type NetOptions } from "./platforms/types.js";
import { checkOptions, cleanOptions, type OptKind, type PostOptions } from "../src/config/postOptions.js";
import { importPostsCsv } from "./postImport.js";
import * as IG from "./platforms/instagram.js";
import * as WA from "./platforms/whatsapp.js";
import type { WebhookEvent } from "./events.js";
import { dispatchEvent } from "./webhooks.js";
import { deleteQueue, freeSlots, loadQueue, nextQueueSlot, QueueError, saveQueue } from "./queue.js";
import { countText, validateMedia, xWeighted } from "./validate.js";
import { enroll, exitOnReply, processSequences, saveSequence, SequenceError, setSequenceStatus, unenroll } from "./sequences.js";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
const FRIENDLY = "Não foi possível concluir agora. Tente de novo em alguns minutos.";
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const now = () => new Date().toISOString();
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const LABEL = Object.fromEntries(Object.entries(CHANNELS).map(([k, v]) => [k, v.label])) as Record<ChannelId, string>;
export const channelLabel = (k: ChannelId) => LABEL[k] ?? k;
const DAY = 86_400_000;

interface Account { id: string; workspace_id: string; connection_id: string | null; kind: ChannelId; external_id: string; parent_external_id: string | null; name: string }
const ACCOUNT_COLS = "id, workspace_id, connection_id, kind, external_id, parent_external_id, name";

/* ------------------------------------------------------------------ autenticação do canal */
async function persistAuth(sb: SupabaseClient, env: Env, connectionId: string, auth: StoredAuth) {
  await sb.from("platform_tokens").update({ access_token_enc: await encryptToken(env, JSON.stringify(auth)), updated_at: now() }).eq("connection_id", connectionId);
}
/** Credenciais prontas (renova o token do Instagram quando preciso e guarda o novo). */
async function channelAuth(sb: SupabaseClient, env: Env, kind: ChannelId, connectionId: string | null): Promise<StoredAuth> {
  if (!connectionId) throw new PlatformError(`${LABEL[kind]} desconectado. Conecte de novo em Conexões.`, true);
  const stored = await loadAuth(sb, env, connectionId);
  const auth = await CHANNELS[kind].ready(env, stored);
  if (auth.accessToken !== stored.accessToken || auth.extra?.refreshedAt !== stored.extra?.refreshedAt) await persistAuth(sb, env, connectionId, auth);
  return auth;
}
const tokenOf = (a: StoredAuth) => { if (!a.accessToken) throw new PlatformError("Conexão sem token. Conecte de novo.", true); return a.accessToken; };

/* ------------------------------------------------------------------ conversas e mensagens */
interface ConvInput { contactName?: string | null; handle?: string | null; picture?: string | null; at: string; preview: string; inbound: boolean }
async function ensureConversation(sb: SupabaseClient, acc: Account, thread: string, c: ConvInput) {
  const { data: existing } = await sb.from("conversations").select("id, unread, contact_name, last_message_at").eq("channel_account_id", acc.id).eq("external_thread_id", thread).maybeSingle();
  if (existing) {
    const newer = Date.parse(c.at) >= Date.parse(existing.last_message_at as string);
    const patch: Json = {};
    if (newer) Object.assign(patch, { last_message_at: c.at, last_message_preview: c.preview.slice(0, 280) });
    if (c.inbound) Object.assign(patch, { unread: (existing.unread as number) + 1, status: "Aberta", last_inbound_at: c.at });
    if (c.contactName && (existing.contact_name as string).startsWith("+") && !c.contactName.startsWith("+")) patch.contact_name = c.contactName;
    if (c.picture) patch.contact_picture = c.picture;
    if (Object.keys(patch).length) await sb.from("conversations").update(patch).eq("id", existing.id);
    return existing.id as string;
  }
  const { data, error } = await sb.from("conversations").upsert({
    workspace_id: acc.workspace_id, channel: LABEL[acc.kind], channel_account_id: acc.id, external_thread_id: thread,
    contact_name: c.contactName || c.handle || thread, contact_handle: c.handle ?? null, contact_picture: c.picture ?? null,
    status: "Aberta", unread: c.inbound ? 1 : 0, last_message_at: c.at, last_message_preview: c.preview.slice(0, 280), last_inbound_at: c.inbound ? c.at : null,
  }, { onConflict: "channel_account_id,external_thread_id" }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Não foi possível criar a conversa.");
  return data.id as string;
}

interface MsgInput { externalId: string | null; direction: "in" | "out"; body: string; kind?: string; mediaId?: string | null; mediaUrl?: string | null; status?: string | null; at: string; authorId?: string | null; error?: string | null; flowId?: string | null }
/** Grava a mensagem; devolve false quando ela já existia (reentrega do webhook). */
async function saveMessage(sb: SupabaseClient, ws: string, conversationId: string, m: MsgInput) {
  const row = { workspace_id: ws, conversation_id: conversationId, direction: m.direction, body: m.body, kind: m.kind ?? "text", media_id: m.mediaId ?? null, media_url: m.mediaUrl ?? null, status: m.status ?? null, error: m.error ?? null, author_id: m.authorId ?? null, sent_at: m.at, external_id: m.externalId, ...(m.flowId ? { flow_id: m.flowId } : {}) };
  if (!m.externalId) { const { data } = await sb.from("messages").insert(row).select("id").single(); return data ? (data.id as number) : null; }
  const { data } = await sb.from("messages").upsert(row, { onConflict: "workspace_id,external_id", ignoreDuplicates: true }).select("id");
  return data?.[0] ? (data[0].id as number) : null;
}

/** A Meta reenvia webhooks; mensagem já gravada não deve contar de novo como não lida. */
async function alreadyHave(sb: SupabaseClient, ws: string, externalId: string) {
  if (!externalId) return false;
  const { data } = await sb.from("messages").select("id").eq("workspace_id", ws).eq("external_id", externalId).limit(1);
  return !!data?.length;
}

/* ------------------------------------------------------------------ sincronização (ao conectar e no botão) */
export async function syncChannel(sb: SupabaseClient, env: Env, conn: { id: string; workspace_id: string; platform: ChannelId }, trigger: "manual" | "agendada" | "conexao") {
  const kind = conn.platform;
  const prov = CHANNELS[kind];
  const ws = conn.workspace_id;
  const { data: run } = await sb.from("sync_runs").insert({ workspace_id: ws, platform: kind, trigger }).select("id").single();
  const detail: Json = { contas: 0 };
  const warnings: string[] = [];
  try {
    const auth = await channelAuth(sb, env, kind, conn.id);
    const found = await prov.discover(env, auth);
    const accounts: Account[] = [];
    for (const a of found) {
      const { data: other } = await sb.from("channel_accounts").select("id, workspace_id, connection_id").eq("kind", kind).eq("external_id", a.externalId).maybeSingle();
      if (other && other.workspace_id !== ws) {
        if (other.connection_id) { warnings.push(`${a.name} já está conectado em outro espaço do NinePro.`); continue; }
        await sb.from("channel_accounts").delete().eq("id", other.id); // estava desconectado: passa para este espaço
      }
      const { data: row, error } = await sb.from("channel_accounts").upsert({
        workspace_id: ws, connection_id: conn.id, kind, external_id: a.externalId, parent_external_id: a.parentExternalId ?? null, name: a.name, display_name: a.displayName ?? null,
        picture_url: a.picture ?? null, status: a.status, quality: a.quality ?? null, detail: a.detail ?? {}, updated_at: now(),
      }, { onConflict: "kind,external_id" }).select(ACCOUNT_COLS).single();
      if (error || !row) { warnings.push(`${a.name}: ${error?.message ?? "não salvo"}`); continue; }
      accounts.push(row as Account);
    }
    detail.contas = accounts.length;
    if (!found.length) warnings.push(kind === "whatsapp" ? "Nenhum número encontrado na conta do WhatsApp Business." : `Nenhuma conta do ${LABEL[kind]} encontrada.`);
    for (const a of found) if (a.status !== "ativo" && a.detail?.aviso) warnings.push(`${a.name}: ${String(a.detail.aviso)}`);
    const sub = await prov.subscribe(env, auth, found);
    if (sub) warnings.push(`Webhooks: ${sub}`);

    if (kind === "whatsapp") {
      let total = 0;
      for (const waba of new Set(accounts.map((a) => a.parent_external_id).filter(Boolean) as string[])) {
        try {
          const list = await WA.waListTemplates(env, tokenOf(auth), waba);
          if (list.length) {
            const { error } = await sb.from("wa_templates").upsert(list.map((t) => ({ workspace_id: ws, connection_id: conn.id, waba_id: waba, external_id: t.id, name: t.name, language: t.language, category: t.category ?? null, status: t.status ?? null, rejected_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null, components: t.components ?? [], updated_at: now() })), { onConflict: "waba_id,external_id" });
            if (error) throw new Error(error.message);
          }
          const keep = list.map((t) => t.id);
          let del = sb.from("wa_templates").delete().eq("workspace_id", ws).eq("waba_id", waba);
          if (keep.length) del = del.not("external_id", "in", `(${keep.join(",")})`);
          await del;
          total += list.length;
        } catch (e) { warnings.push(`Modelos: ${msg(e)}`); }
      }
      detail.modelos = total;
    } else if (kind === "instagram") {
      for (const acc of accounts) {
        const t = tokenOf(auth);
        try { detail.comentarios = await backfillComments(sb, env, t, acc); } catch (e) { warnings.push(`Comentários: ${msg(e)}`); }
        try { detail.conversas = await backfillDirect(sb, env, t, acc); } catch (e) { warnings.push(`Mensagens diretas: ${msg(e)}`); }
        try { detail.publicacoes = await syncMediaStats(sb, env, t, acc); } catch (e) { warnings.push(`Estatísticas: ${msg(e)}`); }
      }
    }
    if (warnings.length) detail.avisos = warnings.slice(0, 10);
    await sb.from("platform_connections").update({ status: "ativa", last_error: warnings[0] ?? null, last_synced_at: now(), updated_at: now() }).eq("id", conn.id);
    if (run) await sb.from("sync_runs").update({ status: accounts.length ? "ok" : "erro", detail, error: warnings[0] ?? null, finished_at: now() }).eq("id", run.id);
    return { ok: true, detail };
  } catch (e) {
    const expired = e instanceof PlatformError && e.expired;
    await sb.from("platform_connections").update({ status: expired ? "expirada" : "erro", last_error: msg(e).slice(0, 500), updated_at: now() }).eq("id", conn.id);
    if (run) await sb.from("sync_runs").update({ status: "erro", detail, error: msg(e).slice(0, 500), finished_at: now() }).eq("id", run.id);
    return { ok: false, error: msg(e), detail };
  }
}

async function backfillComments(sb: SupabaseClient, env: Env, token: string, acc: Account) {
  const media = await IG.igRecentMedia(env, token, 10);
  let n = 0;
  for (const m of media) {
    if (!m.comments_count) continue;
    const comments = await IG.igComments(env, token, m.id).catch(() => []);
    const rows: Json[] = [];
    for (const c of comments) {
      const replies = c.replies?.data ?? [];
      const ownerReply = replies.find((r) => r.from?.id === acc.external_id || r.username === acc.name.replace(/^@/, ""));
      rows.push(commentRow(acc, { id: c.id, text: c.text, username: c.username ?? c.from?.username, fromId: c.from?.id, at: c.timestamp, mediaId: m.id, caption: m.caption, permalink: m.permalink, thumb: m.thumbnail_url ?? m.media_url, replied: !!ownerReply, replyText: ownerReply?.text }));
      for (const r of replies) rows.push(commentRow(acc, { id: r.id, parent: c.id, text: r.text, username: r.username ?? r.from?.username, fromId: r.from?.id, at: r.timestamp, mediaId: m.id, caption: m.caption, permalink: m.permalink, thumb: m.thumbnail_url ?? m.media_url }));
    }
    if (rows.length) { await sb.from("social_comments").upsert(rows, { onConflict: "channel_account_id,external_id" }); n += rows.length; }
  }
  return n;
}
function commentRow(acc: Account, c: { id: string; parent?: string | null; text?: string; username?: string; fromId?: string; at?: string; mediaId?: string; caption?: string; permalink?: string; thumb?: string; replied?: boolean; replyText?: string; kind?: "comment" | "mention" }) {
  const owner = c.fromId === acc.external_id || (!!c.username && c.username === acc.name.replace(/^@/, ""));
  return {
    workspace_id: acc.workspace_id, channel_account_id: acc.id, kind: c.kind ?? "comment", external_id: c.id, parent_external_id: c.parent ?? null, media_id: c.mediaId ?? null,
    media_caption: c.caption ?? null, media_permalink: c.permalink ?? null, media_thumbnail: c.thumb ?? null, author_id: c.fromId ?? null, author_username: c.username ?? null,
    body: c.text ?? "", commented_at: c.at ?? now(), from_owner: owner, ...(c.replied !== undefined ? { replied: c.replied || owner, reply_text: c.replyText ?? null } : { replied: owner }),
  };
}

async function backfillDirect(sb: SupabaseClient, env: Env, token: string, acc: Account) {
  const threads = await IG.igConversations(env, token, 25);
  let n = 0;
  for (const th of threads) {
    const other = th.participants?.data.find((p) => p.id !== acc.external_id && p.username !== acc.name.replace(/^@/, ""));
    const msgs = [...(th.messages?.data ?? [])].reverse();
    if (!other || !msgs.length) continue;
    const last = msgs[msgs.length - 1];
    const lastIn = [...msgs].reverse().find((m) => m.from?.id === other.id);
    const { data: exists } = await sb.from("conversations").select("id").eq("channel_account_id", acc.id).eq("external_thread_id", other.id).maybeSingle();
    let convId = exists?.id as string | undefined;
    if (!convId) {
      const prof = await IG.igProfile(env, token, other.id);
      convId = await ensureConversation(sb, acc, other.id, { contactName: prof.name || (other.username ? `@${other.username}` : null), handle: other.username ? `@${other.username}` : null, picture: prof.profile_pic ?? null, at: last.created_time, preview: last.message || "[Anexo]", inbound: false });
      if (lastIn) await sb.from("conversations").update({ last_inbound_at: lastIn.created_time }).eq("id", convId);
      n++;
    }
    for (const m of msgs) {
      const att = m.attachments?.data?.[0];
      await saveMessage(sb, acc.workspace_id, convId, { externalId: m.id, direction: m.from?.id === other.id ? "in" : "out", body: m.message || (att ? "[Anexo]" : ""), kind: att ? (att.video_data ? "video" : "image") : "text", mediaUrl: att?.image_data?.url ?? att?.video_data?.url ?? null, status: m.from?.id === other.id ? "recebida" : "enviada", at: m.created_time });
    }
  }
  return n;
}

/* ------------------------------------------------------------------ webhooks recebidos da Meta */
async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function signatureOk(secrets: string[], body: string, header: string | null) {
  const got = (header ?? "").replace(/^sha256=/, "");
  if (!got) return false;
  for (const s of secrets) if (safeEqual(await hmacHex(s, body), got)) return true;
  return false;
}

const waBody = (m: Json): { body: string; kind: string; mediaId: string | null } => {
  const t = m.type as string;
  const part = (m[t] ?? {}) as Json;
  switch (t) {
    case "text": return { body: String((part.body as string) ?? ""), kind: "text", mediaId: null };
    case "image": case "video": case "audio": case "document": case "sticker": {
      const label = { image: "[Foto]", video: "[Vídeo]", audio: "[Áudio]", document: `[Documento${part.filename ? `: ${part.filename}` : ""}]`, sticker: "[Figurinha]" }[t];
      return { body: (part.caption as string) || label, kind: t, mediaId: (part.id as string) ?? null };
    }
    case "location": return { body: `[Localização] ${part.name ?? ""} ${part.latitude},${part.longitude}`.trim(), kind: "location", mediaId: null };
    case "button": return { body: String(part.text ?? "[Botão]"), kind: "button", mediaId: null };
    case "interactive": { const r = (part.button_reply ?? part.list_reply ?? {}) as Json; return { body: String(r.title ?? "[Resposta interativa]"), kind: "interactive", mediaId: null }; }
    case "reaction": return { body: `Reagiu ${part.emoji ?? ""}`.trim(), kind: "reaction", mediaId: null };
    case "contacts": return { body: "[Contato compartilhado]", kind: "contacts", mediaId: null };
    default: return { body: `[${t ?? "mensagem"}]`, kind: t ?? "unknown", mediaId: null };
  }
};
const WA_STATUS: Record<string, string> = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };

async function accountFor(sb: SupabaseClient, kind: ChannelId, externalId: string, connectionId?: string): Promise<Account | null> {
  let q = sb.from("channel_accounts").select(ACCOUNT_COLS).eq("kind", kind).eq("external_id", externalId);
  if (connectionId) q = q.eq("connection_id", connectionId);
  const { data } = await q.maybeSingle();
  return (data as Account | null) ?? null;
}

async function handleWhatsAppChange(sb: SupabaseClient, env: Env, change: Json, connectionId?: string) {
  const field = change.field as string;
  const v = (change.value ?? {}) as Json;
  if (field === "message_template_status_update") {
    await sb.from("wa_templates").update({ status: v.event as string, rejected_reason: v.reason && v.reason !== "NONE" ? (v.reason as string) : null, updated_at: now() }).eq("external_id", String(v.message_template_id ?? ""));
    return;
  }
  if (field !== "messages") return;
  const phoneId = String((v.metadata as Json | undefined)?.phone_number_id ?? "");
  const acc = phoneId ? await accountFor(sb, "whatsapp", phoneId, connectionId) : null;
  if (!acc) return;
  const contacts = (v.contacts ?? []) as { wa_id: string; profile?: { name?: string } }[];
  for (const m of (v.messages ?? []) as Json[]) {
    if (await alreadyHave(sb, acc.workspace_id, String(m.id))) continue;
    const from = String(m.from);
    const at = new Date(Number(m.timestamp) * 1000).toISOString();
    const { body, kind, mediaId } = waBody(m);
    const name = contacts.find((c) => c.wa_id === from)?.profile?.name ?? null;
    const convId = await ensureConversation(sb, acc, from, { contactName: name ?? `+${from}`, handle: `+${from}`, at, preview: body, inbound: true });
    const id = await saveMessage(sb, acc.workspace_id, convId, { externalId: String(m.id), direction: "in", body, kind, mediaId, status: "recebida", at });
    if (id === null) continue; // reentrega
    if (mediaId) {
      try {
        const auth = await channelAuth(sb, env, "whatsapp", acc.connection_id);
        const file = await WA.waDownloadMedia(env, tokenOf(auth), mediaId);
        if (file && file.bytes.byteLength <= 20 * 1024 * 1024) {
          const path = `${acc.workspace_id}/${convId}/${String(m.id).replace(/[^\w.-]/g, "_")}`;
          const up = await sb.storage.from("anexos").upload(path, file.bytes, { contentType: file.mime, upsert: true });
          if (!up.error) await sb.from("messages").update({ media_url: path }).eq("id", id);
        }
      } catch (e) { console.error("mídia do WhatsApp:", msg(e)); }
    }
    await dispatchEvent(sb, acc.workspace_id, "mensagem.recebida", { canal: "whatsapp", conversa_id: convId, de: `+${from}`, nome: name, texto: body, tipo: kind, numero: acc.name, recebida_em: at });
    await exitOnReply(sb, convId).catch((e) => console.error("sequência:", msg(e)));
    await runMessageFlows(sb, env, acc, convId, body).catch((e) => console.error("fluxo:", msg(e)));
  }
  for (const s of (v.statuses ?? []) as Json[]) {
    const errors = (s.errors ?? []) as { title?: string; message?: string; error_data?: { details?: string } }[];
    const err = errors[0] ? (errors[0].error_data?.details || errors[0].message || errors[0].title || "Falhou") : null;
    await sb.from("messages").update({ status: WA_STATUS[s.status as string] ?? (s.status as string), ...(err ? { error: err } : {}) }).eq("workspace_id", acc.workspace_id).eq("external_id", String(s.id));
    const rs = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" }[s.status as string];
    if (rs) {
      // não rebaixa: "lida" não volta para "entregue" se os avisos chegarem fora de ordem
      let q = sb.from("msg_campaign_recipients").update({ status: rs, ...(err ? { error: err } : {}) }).eq("workspace_id", acc.workspace_id).eq("external_id", String(s.id));
      if (rs === "entregue") q = q.neq("status", "lida");
      if (rs === "enviada") q = q.eq("status", "pendente");
      await q;
    }
  }
}

async function handleInstagramEntry(sb: SupabaseClient, env: Env, entry: Json, connectionId?: string) {
  const igId = String(entry.id ?? "");
  const acc = igId ? await accountFor(sb, "instagram", igId, connectionId) : null;
  if (!acc) return;
  let token: string | null = null;
  const tok = async () => (token ??= tokenOf(await channelAuth(sb, env, "instagram", acc.connection_id)));

  for (const ev of (entry.messaging ?? []) as Json[]) {
    const m = ev.message as Json | undefined;
    if (!m || m.is_deleted) continue;
    const echo = m.is_echo === true;
    const sender = String((ev.sender as Json)?.id ?? "");
    const recipient = String((ev.recipient as Json)?.id ?? "");
    const thread = echo ? recipient : sender;
    if (!thread || thread === acc.external_id) continue;
    if (await alreadyHave(sb, acc.workspace_id, String(m.mid ?? ""))) continue;
    const at = new Date(Number(ev.timestamp ?? Date.now())).toISOString();
    const att = ((m.attachments ?? []) as { type?: string; payload?: { url?: string } }[])[0];
    const body = String(m.text ?? "") || (att ? { image: "[Foto]", video: "[Vídeo]", audio: "[Áudio]", share: "[Compartilhamento]", story_mention: "[Mencionou você no story]", ig_reel: "[Reel]" }[att.type ?? ""] ?? "[Anexo]" : "");
    const { data: exists } = await sb.from("conversations").select("id").eq("channel_account_id", acc.id).eq("external_thread_id", thread).maybeSingle();
    let prof: { name?: string; username?: string; profile_pic?: string } = {};
    if (!exists) prof = await IG.igProfile(env, await tok().catch(() => ""), thread);
    const convId = await ensureConversation(sb, acc, thread, { contactName: prof.name || (prof.username ? `@${prof.username}` : null), handle: prof.username ? `@${prof.username}` : null, picture: prof.profile_pic ?? null, at, preview: body, inbound: !echo });
    const id = await saveMessage(sb, acc.workspace_id, convId, { externalId: String(m.mid ?? ""), direction: echo ? "out" : "in", body, kind: att?.type ?? "text", mediaUrl: att?.payload?.url ?? null, status: echo ? "enviada" : "recebida", at });
    if (id !== null && !echo) {
      await dispatchEvent(sb, acc.workspace_id, "mensagem.recebida", { canal: "instagram", conversa_id: convId, de: prof.username ? `@${prof.username}` : thread, nome: prof.name ?? null, texto: body, conta: acc.name, recebida_em: at });
      await exitOnReply(sb, convId).catch((e) => console.error("sequência:", msg(e)));
      await runMessageFlows(sb, env, acc, convId, body).catch((e) => console.error("fluxo:", msg(e)));
    }
  }

  for (const ch of (entry.changes ?? []) as Json[]) {
    const v = (ch.value ?? {}) as Json;
    if (ch.field === "comments" || ch.field === "live_comments") {
      const from = (v.from ?? {}) as { id?: string; username?: string };
      const mediaId = String((v.media as Json | undefined)?.id ?? "");
      const { data: known } = await sb.from("social_comments").select("media_caption, media_permalink, media_thumbnail").eq("channel_account_id", acc.id).eq("media_id", mediaId).not("media_permalink", "is", null).limit(1).maybeSingle();
      const media = known ? { caption: known.media_caption as string, permalink: known.media_permalink as string, thumb: known.media_thumbnail as string } : await IG.igMediaInfo(env, await tok(), mediaId).then((x) => ({ caption: x.caption, permalink: x.permalink, thumb: x.thumbnail_url ?? x.media_url })).catch(() => ({ caption: undefined, permalink: undefined, thumb: undefined }));
      const row = commentRow(acc, { id: String(v.id), parent: (v.parent_id as string) ?? null, text: v.text as string, username: from.username, fromId: from.id, at: now(), mediaId, ...media });
      await sb.from("social_comments").upsert(row, { onConflict: "channel_account_id,external_id" });
      if (row.from_owner && row.parent_external_id) await sb.from("social_comments").update({ replied: true, reply_text: row.body }).eq("channel_account_id", acc.id).eq("external_id", row.parent_external_id);
      if (!row.from_owner) {
        await dispatchEvent(sb, acc.workspace_id, "comentario.recebido", { canal: "instagram", tipo: "comentario", id: row.external_id, autor: from.username ?? null, texto: row.body, publicacao: media.permalink ?? mediaId, conta: acc.name });
        await runCommentFlows(sb, env, acc, row.external_id, row.body).catch((e) => console.error("fluxo de comentário:", msg(e)));
      }
    } else if (ch.field === "mentions") {
      const commentId = (v.comment_id as string) ?? null;
      const mediaId = String(v.media_id ?? "");
      let text = "";
      let username: string | undefined;
      let info: IG.IgMedia = { id: mediaId };
      try {
        const t = await tok();
        if (commentId) { const c = await IG.igComment(env, t, commentId); text = c.text ?? ""; username = c.username ?? c.from?.username; }
        info = await IG.igMediaInfo(env, t, mediaId);
        if (!commentId) text = info.caption ?? "";
      } catch { /* sem permissão para ler a menção: guarda só os ids */ }
      await sb.from("social_comments").upsert(commentRow(acc, { id: commentId ?? `media:${mediaId}`, kind: "mention", text, username, at: now(), mediaId, caption: info.caption, permalink: info.permalink, thumb: info.thumbnail_url ?? info.media_url }), { onConflict: "channel_account_id,external_id" });
      await dispatchEvent(sb, acc.workspace_id, "comentario.recebido", { canal: "instagram", tipo: "mencao", autor: username ?? null, texto: text, publicacao: info.permalink ?? mediaId, conta: acc.name });
    }
  }
}

export async function handleChannelWebhook(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const sb = serviceClient(env);
  const key = url.searchParams.get("conta");
  if (!sb) return new Response("indisponível", { status: 503 });
  const { data: conn } = key ? await sb.from("platform_connections").select("id, workspace_id, platform, auth_mode").eq("webhook_key", key).maybeSingle() : { data: null };
  if (key && !conn) return new Response("conexão desconhecida", { status: 404 });

  if (req.method === "GET") {
    const expected = key ? key : env.META_WEBHOOK_VERIFY_TOKEN;
    if (url.searchParams.get("hub.mode") === "subscribe" && expected && url.searchParams.get("hub.verify_token") === expected) return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
    return new Response("verificação recusada", { status: 403 });
  }
  if (req.method !== "POST") return new Response("método não suportado", { status: 405 });

  const raw = await req.text();
  // Assinatura: app do NinePro sempre; app do cliente quando conhecemos a chave secreta (senão a chave da URL autentica)
  let secrets: string[] = [];
  if (conn) {
    const p = conn.platform as ChannelId;
    const auth = await loadAuth(sb, env, conn.id as string).catch(() => null);
    const own = conn.auth_mode === "app_proprio" ? await loadOwnApp(sb, env, conn.workspace_id as string, p).catch(() => null) : null;
    secrets = [auth?.extra?.appSecret, own?.appSecret].filter(Boolean) as string[];
  } else {
    secrets = [env.META_APP_SECRET, env.INSTAGRAM_APP_SECRET].filter(Boolean) as string[];
    if (!secrets.length) return new Response("webhook do NinePro não configurado", { status: 403 });
  }
  if (secrets.length && !(await signatureOk(secrets, raw, req.headers.get("x-hub-signature-256")))) return new Response("assinatura inválida", { status: 401 });

  let payload: Json;
  try { payload = JSON.parse(raw) as Json; } catch { return new Response("corpo inválido", { status: 400 }); }
  const connectionId = conn?.id as string | undefined;
  try {
    for (const entry of (payload.entry ?? []) as Json[]) {
      if (payload.object === "whatsapp_business_account") for (const change of (entry.changes ?? []) as Json[]) await handleWhatsAppChange(sb, env, change, connectionId);
      else if (payload.object === "instagram" || payload.object === "page") await handleInstagramEntry(sb, env, entry, connectionId);
    }
  } catch (e) {
    console.error("webhook de canal:", msg(e)); // responde 200 para a Meta não reenviar em loop; mensagens são idempotentes
  }
  return new Response("ok", { status: 200 });
}

/* ------------------------------------------------------------------ ações enviadas pelas telas e pelos agentes */
/** role: papel de quem pediu (owner/admin/member). source: app, agente (MCP) ou api (chave). */
export interface ChannelCtx { sb: SupabaseClient; env: Env; ws: string; userId: string | null; role?: string; source?: "app" | "agente" | "api" }

async function loadAccount(ctx: ChannelCtx, id: string): Promise<Account> {
  const { data } = await ctx.sb.from("channel_accounts").select(ACCOUNT_COLS).eq("workspace_id", ctx.ws).eq("id", id).maybeSingle();
  if (!data) throw new PlatformError("Canal não encontrado.");
  return data as Account;
}

/** Responde uma conversa (texto e/ou mídia por URL pública). */
export async function sendToConversation(ctx: ChannelCtx, conversationId: string, text: string, media?: { url: string; type: "image" | "video" | "document" | "audio" }, flowId?: string) {
  const { data: conv } = await ctx.sb.from("conversations").select("id, channel_account_id, external_thread_id, last_inbound_at").eq("workspace_id", ctx.ws).eq("id", conversationId).maybeSingle();
  if (!conv?.channel_account_id) throw new PlatformError("Conversa não encontrada ou sem canal conectado.");
  const acc = await loadAccount(ctx, conv.channel_account_id as string);
  const inbound = conv.last_inbound_at ? Date.parse(conv.last_inbound_at as string) : 0;
  if (Date.now() - inbound > DAY) throw new PlatformError(acc.kind === "whatsapp" ? "Passaram mais de 24 horas desde a última mensagem do cliente. No WhatsApp, agora só é possível enviar um modelo aprovado." : "Passaram mais de 24 horas desde a última mensagem do cliente. O Instagram só permite responder dentro dessa janela.");
  const token = tokenOf(await channelAuth(ctx.sb, ctx.env, acc.kind, acc.connection_id));
  const to = conv.external_thread_id as string;
  const body = text.trim();
  if (!body && !media) throw new PlatformError("Escreva a mensagem.");
  let externalId: string | null;
  if (acc.kind === "whatsapp") externalId = media ? await WA.waSendMedia(ctx.env, token, acc.external_id, to, media.type, media.url, body || undefined) : await WA.waSendText(ctx.env, token, acc.external_id, to, body);
  else {
    externalId = null;
    if (media) externalId = await IG.igSendImage(ctx.env, token, acc.external_id, to, media.url);
    if (body) externalId = await IG.igSendText(ctx.env, token, acc.external_id, to, body);
  }
  const at = now();
  const preview = body || `[${media?.type === "image" ? "Foto" : "Anexo"}]`;
  await saveMessage(ctx.sb, ctx.ws, conversationId, { externalId, direction: "out", body: preview, kind: flowId ? "auto" : media?.type ?? "text", mediaUrl: media?.url ?? null, status: "enviada", at, authorId: ctx.userId, flowId: flowId ?? null });
  await ctx.sb.from("conversations").update({ last_message_at: at, last_message_preview: preview.slice(0, 280), unread: 0 }).eq("id", conversationId);
  await dispatchEvent(ctx.sb, ctx.ws, "mensagem.enviada", { canal: acc.kind, conversa_id: conversationId, texto: preview, enviada_em: at });
  return { ok: true, id: externalId };
}

const digits = (s: string) => s.replace(/\D/g, "");
/** Envia um modelo aprovado do WhatsApp (único jeito de iniciar conversa ou falar depois de 24 h). */
export async function sendTemplate(ctx: ChannelCtx, p: { accountId?: string; to: string; templateId: string; bodyParams?: string[]; headerParams?: string[]; contactName?: string }) {
  const { data: tpl } = await ctx.sb.from("wa_templates").select("name, language, status, waba_id, components").eq("workspace_id", ctx.ws).eq("id", p.templateId).maybeSingle();
  if (!tpl) throw new PlatformError("Modelo não encontrado.");
  if (tpl.status !== "APPROVED") throw new PlatformError("Esse modelo ainda não foi aprovado pela Meta.");
  let accQ = ctx.sb.from("channel_accounts").select(ACCOUNT_COLS).eq("workspace_id", ctx.ws).eq("kind", "whatsapp").eq("parent_external_id", tpl.waba_id as string);
  if (p.accountId) accQ = accQ.eq("id", p.accountId);
  const { data: accs } = await accQ.limit(1);
  const acc = accs?.[0] as Account | undefined;
  if (!acc) throw new PlatformError("Nenhum número dessa conta do WhatsApp Business está conectado.");
  const to = digits(p.to);
  if (to.length < 10 || to.length > 15) throw new PlatformError("Informe o número com DDI e DDD, ex.: +55 11 91234-5678.");
  const token = tokenOf(await channelAuth(ctx.sb, ctx.env, "whatsapp", acc.connection_id));
  const bodyParams = (p.bodyParams ?? []).map(String);
  const externalId = await WA.waSendTemplate(ctx.env, token, acc.external_id, to, tpl.name as string, tpl.language as string, bodyParams, (p.headerParams ?? []).map(String));
  const bodyTpl = ((tpl.components as { type: string; text?: string }[]) ?? []).find((c) => c.type === "BODY")?.text ?? tpl.name;
  const rendered = String(bodyTpl).replace(/\{\{(\d+)\}\}/g, (_, n) => bodyParams[Number(n) - 1] ?? `{{${n}}}`);
  const at = now();
  const convId = await ensureConversation(ctx.sb, acc, to, { contactName: p.contactName?.trim() || `+${to}`, handle: `+${to}`, at, preview: rendered, inbound: false });
  await saveMessage(ctx.sb, ctx.ws, convId, { externalId, direction: "out", body: rendered, kind: "template", status: "enviada", at, authorId: ctx.userId });
  await dispatchEvent(ctx.sb, ctx.ws, "mensagem.enviada", { canal: "whatsapp", conversa_id: convId, para: `+${to}`, modelo: tpl.name, texto: rendered, enviada_em: at });
  return { ok: true, conversationId: convId, id: externalId };
}

async function loadComment(ctx: ChannelCtx, id: string) {
  const { data } = await ctx.sb.from("social_comments").select("id, external_id, channel_account_id, media_id, media_caption, media_permalink, media_thumbnail").eq("workspace_id", ctx.ws).eq("id", id).maybeSingle();
  if (!data) throw new PlatformError("Comentário não encontrado.");
  const acc = await loadAccount(ctx, data.channel_account_id as string);
  const token = tokenOf(await channelAuth(ctx.sb, ctx.env, acc.kind, acc.connection_id));
  return { c: data, acc, token };
}
export async function replyComment(ctx: ChannelCtx, commentId: string, text: string, privately = false, button?: { label: string; url: string } | null) {
  let body = text.trim();
  if (!body) throw new PlatformError("Escreva a resposta.");
  const { c, acc, token } = await loadComment(ctx, commentId);
  if (privately && button?.label && button.url) {
    try { await IG.igPrivateReplyButton(ctx.env, token, acc.external_id, c.external_id as string, body, button); }
    catch (e) {
      if (e instanceof PlatformError && e.expired) throw e;
      // a conta não aceita botões (ou o link foi recusado): manda o texto com o link no fim
      body = `${body}

${button.label}: ${button.url}`;
      await IG.igPrivateReply(ctx.env, token, acc.external_id, c.external_id as string, body);
    }
    body = body.includes(button.url) ? body : `${body}
[${button.label}] ${button.url}`;
  } else if (privately) await IG.igPrivateReply(ctx.env, token, acc.external_id, c.external_id as string, body);
  else {
    const r = await IG.igReplyComment(ctx.env, token, c.external_id as string, body);
    await ctx.sb.from("social_comments").upsert(commentRow(acc, { id: r.id, parent: c.external_id as string, text: body, username: acc.name.replace(/^@/, ""), fromId: acc.external_id, mediaId: c.media_id as string, caption: c.media_caption as string, permalink: c.media_permalink as string, thumb: c.media_thumbnail as string }), { onConflict: "channel_account_id,external_id" });
  }
  await ctx.sb.from("social_comments").update({ replied: true, reply_text: privately ? `[Mensagem direta] ${body}` : body }).eq("id", commentId);
  return { ok: true };
}

/* ------------------------------------------------------------------ publicação em várias redes */
export interface PostDraft { text: string; title?: string; custom?: Record<string, string>; mediaUrls: string[]; mediaType?: string; options?: PostOptions }
const mediaOf = (urls: string[]) => urls.map((url) => ({ url, type: (isVideoUrl(url) ? "video" : "image") as "video" | "image" }));

/** Confere o post contra os limites e as opções de cada rede escolhida. Devolve problemas (bloqueiam) e avisos. */
export function checkPost(kinds: ChannelId[], d: PostDraft) {
  const problemas: string[] = []; const avisos: string[] = [];
  const media = mediaOf(d.mediaUrls);
  const imgs = media.filter((m) => m.type === "image").length, vids = media.filter((m) => m.type === "video").length;
  for (const kind of [...new Set(kinds)]) {
    const lim = CHANNELS[kind]?.limits; const name = LABEL[kind] ?? kind;
    if (!lim) { problemas.push(`${name}: publicação não disponível.`); continue; }
    const o = d.options?.[kind as OptKind];
    const text = (d.custom?.[kind] ?? d.text).trim();
    const n = kind === "x" ? xWeighted(text) : graphemes(text);
    const docOrPoll = kind === "linkedin_social" && !!(o?.documento_url || o?.enquete_pergunta);
    if (kind === "instagram" && (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length > 30) problemas.push("Instagram: no máximo 30 hashtags.");
    if (kind === "instagram" && (text.match(/(^|\s)@[\w.]+/g) ?? []).length > 20) problemas.push("Instagram: no máximo 20 menções.");
    if (n > lim.text) (kind === "x" ? avisos : problemas).push(`${name}: o texto tem ${n} caracteres (máximo ${lim.text}${kind === "x" ? ", exceto contas Premium" : ""}).`);
    if (!media.length && !lim.textOnly) problemas.push(`${name}: precisa de ${lim.needsMedia === "video" ? "um vídeo" : "foto ou vídeo"}.`);
    if (!media.length && lim.textOnly && !text && !docOrPoll) problemas.push(`${name}: escreva um texto ou adicione mídia.`);
    if (lim.needsMedia === "video" && !vids && media.length) problemas.push(`${name}: precisa de um vídeo.`);
    if (imgs > lim.images) (lim.images ? avisos : problemas).push(lim.images ? `${name}: só as primeiras ${lim.images} imagens serão usadas.` : `${name}: não aceita imagens, só vídeo.`);
    if (vids > lim.videos) problemas.push(lim.videos ? `${name}: aceita no máximo ${lim.videos} vídeo(s).` : `${name}: não aceita vídeo.`);
    if (imgs && vids && !lim.mixed) problemas.push(`${name}: não mistura fotos e vídeo na mesma publicação.`);
    if (lim.needsTitle && !(d.title?.trim() || text.split("\n")[0])) problemas.push(`${name}: informe o título.`);
    if (lim.titleMax && d.title && graphemes(d.title) > lim.titleMax) problemas.push(`${name}: título com mais de ${lim.titleMax} caracteres.`);
    problemas.push(...checkOptions(kind, o, { media: media.length, hasVideo: vids > 0, label: name }));
    for (const t of (Array.isArray(o?.thread) ? (o!.thread as string[]) : [])) {
      const max = kind === "x" ? 280 : kind === "bluesky" ? 300 : 500;
      const tn = kind === "x" ? xWeighted(t) : graphemes(t);
      if (tn > max) { (kind === "x" ? avisos : problemas).push(`${name}: um item da thread tem ${tn} caracteres (máximo ${max}).`); break; }
    }
    if (o?.primeiro_comentario && !CHANNELS[kind]?.comment && kind !== "instagram") avisos.push(`${name}: primeiro comentário não disponível; será ignorado.`);
  }
  return { ok: !problemas.length, problemas: [...new Set(problemas)], avisos: [...new Set(avisos)] };
}

type PostResult = Record<string, { id?: string; permalink?: string | null; erro?: string; aviso?: string; conta: string; rede?: string; pendente?: string; comentario?: string }>;
const NO_RECYCLE = new Set<ChannelId>(["youtube", "tiktok_social"]);

/** Publica nas contas marcadas. Numa nova tentativa, pula as contas em que já publicou.
 *  Contas com horário próprio ainda no futuro ficam pendentes (a publicação continua agendada). */
export async function publishPost(sb: SupabaseClient, env: Env, postId: string, opts: { approved?: boolean } = {}) {
  const { data: post } = await sb.from("posts").select("*").eq("id", postId).maybeSingle();
  if (!post) throw new PlatformError("Publicação não encontrada.");
  if (post.status === "aguardando_aprovacao" && !opts.approved) throw new PlatformError("Esta publicação aguarda a aprovação de um administrador.");
  const ws = post.workspace_id as string;
  const ids = (post.channel_account_ids as string[]) ?? [];
  if (!ids.length) throw new PlatformError("Escolha ao menos uma conta.");
  const { data: accs } = await sb.from("channel_accounts").select(`${ACCOUNT_COLS}, detail`).eq("workspace_id", ws).in("id", ids);
  const prev = (post.result ?? {}) as PostResult;
  const result: PostResult = {};
  const urls = (post.media_urls as string[]) ?? [];
  const custom = (post.custom ?? {}) as Record<string, string>;
  const options = (post.options ?? {}) as PostOptions;
  const times = (post.times ?? {}) as Record<string, string>;
  const pending: number[] = [];
  let attempted = 0;
  for (const acc of (accs ?? []) as (Account & { detail: Json })[]) {
    if (prev[acc.id]?.id) { result[acc.id] = prev[acc.id]; continue; }
    const own = Date.parse(times[acc.kind] ?? "");
    if (Number.isFinite(own) && own > Date.now() + 30_000) { pending.push(own); result[acc.id] = { conta: acc.name, rede: LABEL[acc.kind] ?? acc.kind, pendente: new Date(own).toISOString() }; continue; }
    attempted++;
    const text = String(custom[acc.kind] ?? post.content ?? "");
    const o = (options[acc.kind as OptKind] ?? {}) as NetOptions;
    try {
      let r: { id: string; permalink: string | null; aviso?: string };
      let auth: StoredAuth;
      const pa = { externalId: acc.external_id, name: acc.name, detail: acc.detail ?? {} };
      if (acc.kind === "instagram") {
        auth = await channelAuth(sb, env, "instagram", acc.connection_id);
        const fmt = o.formato === "reels" ? "REELS" : o.formato === "stories" ? "STORIES" : (post.media_type as "IMAGE");
        r = await IG.igPublish(env, tokenOf(auth), acc.external_id, { type: fmt, urls, caption: text, extras: { collaborators: optList(o, "colaboradores"), userTags: optList(o, "marcar"), shareToFeed: o.compartilhar_no_feed === false ? false : undefined, coverUrl: optStr(o, "capa_url") || undefined, locationId: optStr(o, "local_id") || undefined } });
      } else {
        const prov = CHANNELS[acc.kind];
        if (!prov?.publish) throw new PlatformError(`Publicação não disponível para ${LABEL[acc.kind] ?? acc.kind}.`);
        auth = await channelAuth(sb, env, acc.kind, acc.connection_id);
        r = await prov.publish(env, auth, pa, { text, title: (post.title as string | null) ?? undefined, media: mediaOf(urls), format: post.media_type as string, options: o });
      }
      const row: PostResult[string] = { id: r.id, permalink: r.permalink, conta: acc.name, rede: LABEL[acc.kind] ?? acc.kind, ...(r.aviso ? { aviso: r.aviso } : {}) };
      const fc = optStr(o, "primeiro_comentario").trim();
      if (fc) {
        try {
          const c = acc.kind === "instagram" ? await IG.igPostComment(env, tokenOf(auth), r.id, fc) : await CHANNELS[acc.kind]?.comment?.(env, auth, pa, r.id, fc);
          if (c) row.comentario = c.id; else row.aviso = [row.aviso, "Primeiro comentário não disponível nesta rede."].filter(Boolean).join(" ");
        } catch (e) { row.aviso = [row.aviso, `Primeiro comentário não foi feito: ${msg(e)}`].filter(Boolean).join(" "); }
      }
      result[acc.id] = row;
    } catch (e) { result[acc.id] = { erro: msg(e), conta: acc.name, rede: LABEL[acc.kind] ?? acc.kind }; }
  }
  const all = Object.values(result);
  const ok = all.filter((r) => r.id).length;
  const errors = all.filter((r) => r.erro).map((r) => `${r.rede ? `${r.rede} ` : ""}${r.conta}: ${r.erro}`);
  if (pending.length) {
    // ainda há redes com horário próprio: continua agendada para o próximo horário
    const next = new Date(Math.min(...pending)).toISOString();
    await sb.from("posts").update({ status: "agendada", scheduled_at: next, result, error: errors.join(" · ") || null, published_at: ok ? (post.published_at ?? now()) : null, attempts: errors.length && attempted ? ((post.attempts as number) ?? 0) + 1 : (post.attempts as number) ?? 0, updated_at: now() }).eq("id", postId);
    return { ok: ok > 0 || !errors.length, status: "agendada", result, error: errors[0] ?? null, proxima: next };
  }
  const status = !ok ? "falhou" : errors.length ? "parcial" : "publicada";
  await sb.from("posts").update({ status, result, error: errors.join(" · ") || null, published_at: ok ? (post.published_at ?? now()) : null, attempts: ((post.attempts as number) ?? 0) + 1, updated_at: now() }).eq("id", postId);
  await dispatchEvent(sb, ws, (ok ? "publicacao.publicada" : "publicacao.falhou") as WebhookEvent, { publicacao_id: postId, status, resultado: result });
  const reciclada = ok && post.status !== "parcial" ? await recyclePost(sb, post as Json).catch(() => null) : null;
  return { ok: ok > 0, status, result, error: errors[0] ?? null, ...(reciclada ? { reciclada } : {}) };
}

/** Evergreen: depois de publicar, agenda uma cópia para daqui a N dias (com o próximo texto alternativo). */
export async function recyclePost(sb: SupabaseClient, post: Json) {
  const r = post.recycling as Recycling | null;
  if (!r?.a_cada_dias) return null;
  const count = ((post.recycle_count as number) ?? 0) + 1;
  if (r.vezes && count > r.vezes) return null;
  const at = new Date(Date.now() + r.a_cada_dias * 86_400_000);
  if (r.ate && at.getTime() > Date.parse(r.ate)) return null;
  const { data: accs } = await sb.from("channel_accounts").select("id, kind").in("id", (post.channel_account_ids as string[]) ?? []);
  const keep = (accs ?? []).filter((a) => !NO_RECYCLE.has(a.kind as ChannelId));
  if (!keep.length) return null;
  const texts = [String(post.content ?? ""), ...(r.variacoes ?? [])];
  const content = texts[count % texts.length];
  const { data } = await sb.from("posts").insert({
    workspace_id: post.workspace_id, content, title: post.title, custom: r.variacoes?.length ? {} : post.custom, options: post.options, channels: [...new Set(keep.map((a) => LABEL[a.kind as ChannelId] ?? a.kind))],
    channel_account_ids: keep.map((a) => a.id), media_urls: post.media_urls, media_type: post.media_type, status: "agendada", scheduled_at: at.toISOString(), recycling: r,
    recycled_from: (post.recycled_from as string | null) ?? post.id, recycle_count: count, source: post.source ?? "app", created_by: post.created_by, result: {}, attempts: 0,
  }).select("id").single();
  if (data) await dispatchEvent(sb, post.workspace_id as string, "publicacao.reciclada" as WebhookEvent, { publicacao_id: data.id, original_id: (post.recycled_from as string | null) ?? post.id, vez: count, agendada_para: at.toISOString() });
  return data ? { id: data.id as string, agendada_para: at.toISOString(), vez: count } : null;
}

export interface Recycling { a_cada_dias: number; vezes?: number; ate?: string; variacoes?: string[] }
function cleanRecycling(v: unknown): Recycling | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Json;
  const days = Math.round(Number(o.a_cada_dias ?? o.everyDays ?? 0));
  if (!Number.isFinite(days) || days < 1) return null;
  if (days > 365) throw new PlatformError("Reciclagem: o intervalo vai até 365 dias.");
  const vezes = o.vezes ? Math.min(100, Math.max(1, Math.round(Number(o.vezes)))) : undefined;
  const ate = o.ate && !Number.isNaN(Date.parse(String(o.ate))) ? new Date(String(o.ate)).toISOString() : undefined;
  const variacoes = (Array.isArray(o.variacoes) ? o.variacoes : []).map((x) => String(x).trim()).filter(Boolean).map((x) => x.slice(0, 63206)).slice(0, 10);
  return { a_cada_dias: days, ...(vezes ? { vezes } : {}), ...(ate ? { ate } : {}), ...(variacoes.length ? { variacoes } : {}) };
}

/** A regra do espaço exige aprovação para esta publicação? */
async function needsApproval(ctx: ChannelCtx, asked: boolean) {
  if (asked) return true;
  const { data } = await ctx.sb.from("workspaces").select("approval_policy").eq("id", ctx.ws).maybeSingle();
  const pol = (data?.approval_policy as string | undefined) ?? "nenhuma";
  const agent = ctx.source === "agente" || ctx.source === "api";
  if (pol === "todos") return true;
  if (pol === "membros") return agent || !["owner", "admin"].includes(ctx.role ?? "");
  if (pol === "agentes") return agent;
  return false;
}

/** Cria ou altera uma publicação (rascunho, agendada, na fila ou para publicar agora) em uma ou várias redes. */
export async function savePost(ctx: ChannelCtx, p: Json) {
  const content = String(p.content ?? "").slice(0, 63206);
  const title = p.title ? String(p.title).slice(0, 255) : null;
  const custom = Object.fromEntries(Object.entries((p.custom ?? {}) as Json).filter(([k, v]) => isChannel(k) && typeof v === "string" && v.trim()).map(([k, v]) => [k, String(v).slice(0, 63206)]));
  const accountIdsRaw = () => (Array.isArray(p.accountIds) ? p.accountIds : []).map(String).slice(0, 50);
  const mediaUrls = (Array.isArray(p.mediaUrls) ? p.mediaUrls : []).map(String).filter((u) => /^https:\/\//.test(u)).slice(0, 35);
  const mediaType = ["IMAGE", "VIDEO", "REELS", "CAROUSEL", "STORIES"].includes(String(p.mediaType)) ? String(p.mediaType) : mediaUrls.length > 1 ? "CAROUSEL" : mediaUrls.some(isVideoUrl) ? "REELS" : "IMAGE";
  const when = p.scheduledAt ? new Date(String(p.scheduledAt)) : null;
  const mode = p.mode === "agora" ? "agora" : p.mode === "agendar" || p.mode === "fila" ? "agendar" : "rascunho";
  let queueId: string | null = null;
  let when2 = when;
  if (p.mode === "fila") {
    try { const q = await nextQueueSlot(ctx.sb, ctx.ws, p.queueId ? String(p.queueId) : null, p.id ? String(p.id) : undefined); queueId = q.queue.id; when2 = q.at; if (!(Array.isArray(p.accountIds) && p.accountIds.length) && q.queue.account_ids.length) p.accountIds = q.queue.account_ids; }
    catch (e) { throw new PlatformError(e instanceof Error ? e.message : String(e)); }
  }
  const accountIds = accountIdsRaw();
  const { data: accs } = accountIds.length ? await ctx.sb.from("channel_accounts").select("id, name, kind").eq("workspace_id", ctx.ws).in("id", accountIds).in("kind", PUBLISHABLE) : { data: [] as { id: string; name: string; kind: ChannelId }[] };
  const kinds = [...new Set((accs ?? []).map((a) => a.kind as ChannelId))];
  const options = cleanOptions(p.options, kinds.length ? kinds : undefined);
  // horário próprio por rede (só para redes marcadas, e no futuro)
  const times: Record<string, string> = {};
  if (p.mode !== "fila" && mode !== "rascunho") for (const [k, v] of Object.entries((p.times ?? {}) as Json)) {
    if (!kinds.includes(k as ChannelId) || !v) continue;
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 60_000) throw new PlatformError(`${LABEL[k as ChannelId] ?? k}: o horário próprio precisa ser no futuro.`);
    times[k] = d.toISOString();
  }
  const recycling = cleanRecycling(p.recycling);
  if (mode !== "rascunho") {
    if (!accs?.length) throw new PlatformError("Escolha ao menos uma conta para publicar.");
    const chk = checkPost(kinds, { text: content, title: title ?? undefined, custom, mediaUrls, mediaType, options });
    if (!chk.ok) throw new PlatformError(chk.problemas.join(" "));
  }
  const allOwn = kinds.length > 0 && kinds.every((k) => times[k]);
  if (mode === "agendar" && !allOwn && (!when2 || Number.isNaN(when2.getTime()) || when2.getTime() < Date.now() + 60_000)) throw new PlatformError("Escolha uma data e hora no futuro.");
  const first = [mode === "agendar" && when2 && !Number.isNaN(when2.getTime()) && !allOwn ? when2.getTime() : null, ...Object.values(times).map((t) => Date.parse(t))].filter((x): x is number => typeof x === "number");
  const scheduled = mode === "agendar" ? new Date(Math.min(...first)).toISOString() : mode === "agora" ? now() : null;
  const approval = mode !== "rascunho" && (await needsApproval(ctx, p.requiresApproval === true));
  const status = mode === "rascunho" ? "rascunho" : approval ? "aguardando_aprovacao" : "agendada";
  const row = { workspace_id: ctx.ws, content, title, custom, options, times, recycling, channels: [...new Set((accs ?? []).map((a) => LABEL[a.kind as ChannelId] ?? a.kind))], channel_account_ids: (accs ?? []).map((a) => a.id), media_urls: mediaUrls, media_type: mediaType,
    status, scheduled_at: approval && mode === "agora" ? null : scheduled, queue_id: queueId, error: null, attempts: 0, result: {}, reviewed_by: null, reviewed_at: null, review_note: null, updated_at: now() };
  const id = p.id ? String(p.id) : null;
  const q = id ? ctx.sb.from("posts").update(row).eq("workspace_id", ctx.ws).eq("id", id) : ctx.sb.from("posts").insert({ ...row, created_by: ctx.userId, source: ctx.source ?? "app" });
  const { data, error } = await q.select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Não foi possível salvar.");
  if (approval) {
    await dispatchEvent(ctx.sb, ctx.ws, "publicacao.aguardando_aprovacao" as WebhookEvent, { publicacao_id: data.id, agendada_para: row.scheduled_at, origem: ctx.source ?? "app" });
    return { id: data.id as string, ok: true, status, aguardando_aprovacao: true, ...(row.scheduled_at ? { agendada_para: row.scheduled_at } : {}), mensagem: "A publicação foi para aprovação. Um administrador precisa aprovar antes de publicar." };
  }
  if (mode === "agora") return { id: data.id as string, ...(await publishPost(ctx.sb, ctx.env, data.id as string)) };
  return { id: data.id as string, ok: true, status: row.status, ...(row.scheduled_at ? { agendada_para: row.scheduled_at } : {}), ...(queueId ? { fila: queueId } : {}) };
}

/** Aprova (publica ou agenda) ou rejeita (volta para rascunho com o motivo) uma publicação. */
export async function reviewPost(ctx: ChannelCtx, postId: string, approve: boolean, note?: string) {
  const { data: post } = await ctx.sb.from("posts").select("id, status, scheduled_at").eq("workspace_id", ctx.ws).eq("id", postId).maybeSingle();
  if (!post) throw new PlatformError("Publicação não encontrada.");
  if (post.status !== "aguardando_aprovacao") throw new PlatformError("Esta publicação não está aguardando aprovação.");
  const base = { reviewed_by: ctx.userId, reviewed_at: now(), review_note: note ? note.slice(0, 1000) : null, updated_at: now() };
  if (!approve) {
    await ctx.sb.from("posts").update({ ...base, status: "rascunho", scheduled_at: null }).eq("id", postId);
    await dispatchEvent(ctx.sb, ctx.ws, "publicacao.rejeitada" as WebhookEvent, { publicacao_id: postId, motivo: base.review_note });
    return { ok: true, status: "rascunho", rejeitada: true };
  }
  const at = post.scheduled_at ? Date.parse(post.scheduled_at as string) : 0;
  await dispatchEvent(ctx.sb, ctx.ws, "publicacao.aprovada" as WebhookEvent, { publicacao_id: postId, agendada_para: at > Date.now() + 60_000 ? post.scheduled_at : null });
  if (at > Date.now() + 60_000) {
    await ctx.sb.from("posts").update({ ...base, status: "agendada" }).eq("id", postId);
    return { ok: true, status: "agendada", agendada_para: post.scheduled_at };
  }
  await ctx.sb.from("posts").update({ ...base, status: "agendada", scheduled_at: now() }).eq("id", postId);
  return { aprovada: true, ...(await publishPost(ctx.sb, ctx.env, postId, { approved: true })) };
}

/* ------------------------------------------------------------------ handler HTTP das telas */
export async function handleChannels(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "Método não suportado." });
  const sb = serviceClient(env);
  if (!sb) return json(503, { error: FRIENDLY });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = token ? await sb.auth.getUser(token) : { data: { user: null } };
  if (!u.user) return json(401, { error: "Sessão inválida. Entre de novo." });
  const body = (await req.json().catch(() => ({}))) as Json;
  const ws = String(body.workspaceId ?? "");
  const { data: mem } = await sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", u.user.id).maybeSingle();
  if (!mem) return json(403, { error: "Você não faz parte deste espaço." });
  const isAdmin = ["owner", "admin"].includes(mem.role as string);
  const ctx: ChannelCtx = { sb, env, ws, userId: u.user.id, role: mem.role as string, source: "app" };
  const str = (k: string) => String(body[k] ?? "");
  try {
    switch (body.action) {
      case "send_message": {
        const media = body.mediaUrl ? { url: str("mediaUrl"), type: (["image", "video", "document", "audio"].includes(str("mediaType")) ? str("mediaType") : "image") as "image" } : undefined;
        return json(200, await sendToConversation(ctx, str("conversationId"), str("text"), media));
      }
      case "send_template":
        return json(200, await sendTemplate(ctx, { accountId: body.accountId ? str("accountId") : undefined, to: str("to"), templateId: str("templateId"), bodyParams: body.bodyParams as string[], headerParams: body.headerParams as string[], contactName: str("contactName") }));
      case "mark_read": {
        const { data: conv } = await sb.from("conversations").select("id, channel_account_id").eq("workspace_id", ws).eq("id", str("conversationId")).maybeSingle();
        if (!conv) return json(404, { error: "Conversa não encontrada." });
        await sb.from("conversations").update({ unread: 0 }).eq("id", conv.id);
        const acc = conv.channel_account_id ? await loadAccount(ctx, conv.channel_account_id as string).catch(() => null) : null;
        if (acc?.kind === "whatsapp") {
          const { data: last } = await sb.from("messages").select("external_id").eq("conversation_id", conv.id).eq("direction", "in").not("external_id", "is", null).order("sent_at", { ascending: false }).limit(1).maybeSingle();
          if (last?.external_id) await channelAuth(sb, env, "whatsapp", acc.connection_id).then((a) => WA.waMarkRead(env, tokenOf(a), acc.external_id, last.external_id as string)).catch(() => undefined);
        }
        return json(200, { ok: true });
      }
      case "comment_reply": return json(200, await replyComment(ctx, str("commentId"), str("text"), body.private === true));
      case "comment_hide": {
        const { c, token: t } = await loadComment(ctx, str("commentId"));
        await IG.igHideComment(env, t, c.external_id as string, body.hidden === true);
        await sb.from("social_comments").update({ hidden: body.hidden === true }).eq("id", c.id);
        return json(200, { ok: true });
      }
      case "comment_delete": {
        const { c, token: t } = await loadComment(ctx, str("commentId"));
        await IG.igDeleteComment(env, t, c.external_id as string);
        await sb.from("social_comments").delete().eq("id", c.id);
        return json(200, { ok: true });
      }
      case "template_create": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem criar modelos." });
        const acc = await loadAccount(ctx, str("accountId"));
        if (acc.kind !== "whatsapp" || !acc.parent_external_id) return json(400, { error: "Escolha um número do WhatsApp." });
        const name = str("name").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 512);
        if (!name) return json(400, { error: "Dê um nome ao modelo." });
        const text = str("body").trim();
        if (!text) return json(400, { error: "Escreva o texto do modelo." });
        const vars = [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
        const examples = (Array.isArray(body.examples) ? body.examples : []).map(String);
        if (vars.length && examples.filter(Boolean).length < vars.length) return json(400, { error: `Dê um exemplo para cada variável ({{1}}…{{${vars.length}}}). A Meta exige.` });
        const components: Json[] = [];
        if (str("header").trim()) components.push({ type: "HEADER", format: "TEXT", text: str("header").trim().slice(0, 60) });
        components.push({ type: "BODY", text, ...(vars.length ? { example: { body_text: [examples.slice(0, vars.length)] } } : {}) });
        if (str("footer").trim()) components.push({ type: "FOOTER", text: str("footer").trim().slice(0, 60) });
        const buttons = (Array.isArray(body.buttons) ? body.buttons : []).map(String).map((b) => b.trim()).filter(Boolean).slice(0, 3);
        if (buttons.length) components.push({ type: "BUTTONS", buttons: buttons.map((b) => ({ type: "QUICK_REPLY", text: b.slice(0, 25) })) });
        const category = ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(str("category")) ? str("category") : "MARKETING";
        const language = /^[a-z]{2}(_[A-Z]{2})?$/.test(str("language")) ? str("language") : "pt_BR";
        const t = tokenOf(await channelAuth(sb, env, "whatsapp", acc.connection_id));
        const r = await WA.waCreateTemplate(env, t, acc.parent_external_id, { name, language, category, components });
        await sb.from("wa_templates").upsert({ workspace_id: ws, connection_id: acc.connection_id, waba_id: acc.parent_external_id, external_id: r.id, name, language, category: r.category ?? category, status: r.status ?? "PENDING", components, updated_at: now() }, { onConflict: "waba_id,external_id" });
        return json(200, { ok: true, id: r.id, status: r.status ?? "PENDING" });
      }
      case "template_delete": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem excluir modelos." });
        const { data: tpl } = await sb.from("wa_templates").select("id, name, external_id, waba_id, connection_id").eq("workspace_id", ws).eq("id", str("templateId")).maybeSingle();
        if (!tpl) return json(404, { error: "Modelo não encontrado." });
        const t = tokenOf(await channelAuth(sb, env, "whatsapp", tpl.connection_id as string));
        await WA.waDeleteTemplate(env, t, tpl.waba_id as string, tpl.name as string, tpl.external_id as string);
        await sb.from("wa_templates").delete().eq("id", tpl.id);
        return json(200, { ok: true });
      }
      case "post_save": return json(200, await savePost(ctx, body));
      case "post_review": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem aprovar publicações." });
        return json(200, await reviewPost(ctx, str("postId"), body.approve === true, body.note ? str("note") : undefined));
      }
      case "posts_policy": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem mudar a regra de aprovação." });
        const policy = ["nenhuma", "agentes", "membros", "todos"].includes(str("policy")) ? str("policy") : "nenhuma";
        await sb.from("workspaces").update({ approval_policy: policy, updated_at: now() }).eq("id", ws);
        return json(200, { ok: true, policy });
      }
      case "post_import": return json(200, await importPostsCsv(ctx, str("csv"), { dryRun: body.dryRun !== false, defaultAccountIds: body.accountIds as string[] | undefined }));
      /* ---------------- fila de publicação */
      case "queue_save": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem mudar a fila." });
        return json(200, await saveQueue(sb, ws, { id: body.queueId ? str("queueId") : undefined, name: body.name as string, timezone: body.timezone as string, slots: body.slots, accountIds: body.accountIds as string[] | undefined, active: body.active as boolean | undefined, setAsDefault: body.setAsDefault === true, reshuffle: body.reshuffle === true }));
      }
      case "queue_delete": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem excluir a fila." });
        return json(200, await deleteQueue(sb, ws, str("queueId")));
      }
      case "queue_preview": {
        const q = await loadQueue(sb, ws, body.queueId ? str("queueId") : null);
        return json(200, { proximos: (await freeSlots(sb, q, Math.min(50, Math.max(1, Number(body.count ?? 10))))).map((d) => d.toISOString()) });
      }
      /* ---------------- validação */
      case "validate_media": return json(200, await validateMedia(str("url"), (body.kinds as never[]) ?? undefined));
      case "count_text": return json(200, countText(str("text"), (body.kinds as never[]) ?? undefined));
      /* ---------------- sequências */
      case "seq_save": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem editar sequências." });
        return json(200, await saveSequence(sb, ws, u.user.id, (body.sequence ?? {}) as Json));
      }
      case "seq_status": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem ativar ou pausar sequências." });
        return json(200, await setSequenceStatus(sb, ws, str("sequenceId"), body.status === "ativa" ? "ativa" : "pausada"));
      }
      case "seq_delete": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem excluir sequências." });
        await sb.from("sequences").delete().eq("workspace_id", ws).eq("id", str("sequenceId"));
        return json(200, { ok: true });
      }
      case "seq_enroll": return json(200, await enroll(sb, ws, str("sequenceId"), { conversationIds: body.conversationIds as string[], phones: body.phones as { phone: string; name?: string }[] }));
      case "seq_unenroll": return json(200, await unenroll(sb, ws, str("enrollmentId")));
      case "broadcast_create": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem fazer disparos." });
        return json(200, await createBroadcast(ctx, body));
      }
      case "post_publish": {
        const { data: post } = await sb.from("posts").select("id").eq("workspace_id", ws).eq("id", str("postId")).maybeSingle();
        if (!post) return json(404, { error: "Publicação não encontrada." });
        return json(200, await publishPost(sb, env, post.id as string));
      }
      case "post_delete": {
        await sb.from("posts").delete().eq("workspace_id", ws).eq("id", str("postId")).neq("status", "publicada");
        return json(200, { ok: true });
      }
      case "toggle_channel": {
        if (!isAdmin) return json(403, { error: "Só administradores do espaço podem fazer isso." });
        await sb.from("channel_accounts").update({ enabled: body.enabled === true, updated_at: now() }).eq("workspace_id", ws).eq("id", str("accountId"));
        return json(200, { ok: true });
      }
      default:
        return json(400, { error: "Ação desconhecida." });
    }
  } catch (e) {
    if (e instanceof PlatformError) return json(400, { error: e.expired ? "As credenciais do canal expiraram. Reconecte em Conexões." : e.message });
    if (e instanceof QueueError || e instanceof SequenceError) return json(400, { error: e.message });
    console.error(e);
    return json(500, { error: FRIENDLY });
  }
}

/** Vercel Cron: publica as publicações agendadas que já venceram. */
export async function handlePublishDue(req: Request, env: Env): Promise<Response> {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return json(401, { error: "Não autorizado." });
  const sb = serviceClient(env);
  if (!sb) return json(503, { error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." });
  const broadcasts = await processBroadcasts(sb, env, 150_000).catch((e) => ({ erro: msg(e) }));
  const sequencias = await processSequences(sb, env, 60_000).catch((e) => ({ erro: msg(e) }));
  const { data: due } = await sb.from("posts").select("id").eq("status", "agendada").lte("scheduled_at", now()).lt("attempts", 3).order("scheduled_at").limit(20);
  const results = [];
  for (const p of due ?? []) results.push({ id: p.id, ...(await publishPost(sb, env, p.id as string).catch((e) => ({ ok: false, error: msg(e) }))) });
  return json(200, { publicadas: results.filter((r) => r.ok).length, results, disparos: broadcasts, sequencias });
}

export { isChannel };

/* ------------------------------------------------------------------ fluxos (respostas automáticas) */
interface Flow { sequence_id?: string | null; id: string; trigger: string; channel: string; match: string; keywords: string[]; reply: string; comment_reply: string; hours: { start?: string; end?: string; days?: number[] }; runs: number; button_label?: string | null; button_url?: string | null; media_ids?: string[]; post_id?: string | null; once_per_user?: boolean }
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const matches = (f: Flow, text: string) => {
  if (f.match === "qualquer" || !f.keywords.length) return true;
  const t = norm(text);
  return f.match === "exata" ? f.keywords.some((k) => norm(k) === t) : f.keywords.some((k) => norm(k) && t.includes(norm(k)));
};
const TZ = "America/Sao_Paulo";
/** Está fora do horário de atendimento configurado? (fuso de Brasília) */
export function outsideHours(h: Flow["hours"], at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at).map((p) => [p.type, p.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const mins = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const toMin = (s?: string, d = 0) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : d; };
  const days = h.days?.length ? h.days : [1, 2, 3, 4, 5];
  return !days.includes(day) || mins < toMin(h.start, 540) || mins >= toMin(h.end, 1080);
}
const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{\{\s*(nome|primeiro_nome)\s*\}\}/gi, (_, k) => vars[String(k).toLowerCase()] ?? "");

async function runMessageFlows(sb: SupabaseClient, env: Env, acc: Account, convId: string, text: string) {
  const { data: flows } = await sb.from("inbox_flows").select("id, trigger, channel, match, keywords, reply, comment_reply, hours, runs, sequence_id").eq("workspace_id", acc.workspace_id).eq("status", "ativo").neq("trigger", "comentario").order("created_at");
  if (!flows?.length) return;
  const { count: inbound } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", convId).eq("direction", "in");
  const { data: conv } = await sb.from("conversations").select("contact_name").eq("id", convId).single();
  const name = String(conv?.contact_name ?? "");
  const vars = { nome: name.startsWith("+") || name.startsWith("@") ? "" : name, primeiro_nome: name.startsWith("+") || name.startsWith("@") ? "" : name.split(" ")[0] };
  for (const f of flows as Flow[]) {
    if (f.channel !== "todos" && f.channel !== LABEL[acc.kind]) continue;
    if (!f.reply.trim() && !f.sequence_id) continue;
    if (f.trigger === "primeira_mensagem" && (inbound ?? 0) > 1) continue;
    if (f.trigger === "fora_do_horario" && !outsideHours(f.hours)) continue;
    if (!matches(f, text)) continue;
    // não repete o mesmo fluxo na mesma conversa por 6 horas
    const { count: recent } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", convId).eq("flow_id", f.id).gte("sent_at", new Date(Date.now() - 6 * 3_600_000).toISOString());
    if ((recent ?? 0) > 0) continue;
    if (f.reply.trim()) await sendToConversation({ sb, env, ws: acc.workspace_id, userId: null }, convId, fill(f.reply, vars), undefined, f.id);
    if (f.sequence_id) await enroll(sb, acc.workspace_id, f.sequence_id, { conversationIds: [convId] }).catch((e) => console.error("inscrição na sequência:", msg(e)));
    await sb.from("inbox_flows").update({ runs: f.runs + 1, last_run_at: now() }).eq("id", f.id);
    return; // só o primeiro fluxo que combinar
  }
}

async function runCommentFlows(sb: SupabaseClient, env: Env, acc: Account, commentExternalId: string, text: string) {
  if (acc.kind !== "instagram") return;
  const { data: flows } = await sb.from("inbox_flows").select("id, trigger, channel, match, keywords, reply, comment_reply, hours, runs, button_label, button_url, media_ids, post_id, once_per_user").eq("workspace_id", acc.workspace_id).eq("status", "ativo").eq("trigger", "comentario").order("created_at");
  if (!flows?.length) return;
  const { data: c } = await sb.from("social_comments").select("id, author_id, author_username, media_id, flow_id").eq("channel_account_id", acc.id).eq("external_id", commentExternalId).single();
  if (!c || c.flow_id) return;
  // publicações feitas pelo NinePro: o ID da mídia fica no resultado da publicação
  const postIds = [...new Set((flows as Flow[]).map((f) => f.post_id).filter(Boolean))] as string[];
  const postMedia = new Map<string, string[]>();
  if (postIds.length) {
    const { data: posts } = await sb.from("posts").select("id, result").in("id", postIds);
    for (const p of posts ?? []) postMedia.set(p.id as string, Object.values((p.result ?? {}) as Record<string, { id?: string }>).map((r) => r.id ?? "").filter(Boolean));
  }
  const onMedia = (f: Flow) => {
    const ids = [...(f.media_ids ?? []), ...(f.post_id ? postMedia.get(f.post_id) ?? ["—"] : [])];
    return !ids.length || (!!c.media_id && ids.includes(c.media_id as string));
  };
  let f: Flow | undefined;
  for (const x of flows as Flow[]) {
    if (x.channel !== "todos" && x.channel !== "Instagram") continue;
    if (!(x.reply.trim() || x.comment_reply.trim()) || !onMedia(x) || !matches(x, text)) continue;
    if (x.once_per_user !== false && c.author_id) {
      const { count } = await sb.from("social_comments").select("id", { count: "exact", head: true }).eq("flow_id", x.id).eq("author_id", c.author_id);
      if ((count ?? 0) > 0) continue;
    }
    f = x; break;
  }
  if (!f) return;
  // marca antes de responder: reentregas do webhook não disparam duas vezes
  const { data: claimed } = await sb.from("social_comments").update({ flow_id: f.id }).eq("id", c.id).is("flow_id", null).select("id");
  if (!claimed?.length) return;
  const ctx: ChannelCtx = { sb, env, ws: acc.workspace_id, userId: null };
  const vars = { nome: String(c.author_username ?? ""), primeiro_nome: String(c.author_username ?? "") };
  if (f.comment_reply.trim()) await replyComment(ctx, c.id as string, fill(f.comment_reply, vars), false).catch((e) => console.error("resposta pública:", msg(e)));
  if (f.reply.trim()) await replyComment(ctx, c.id as string, fill(f.reply, vars), true, f.button_label && f.button_url ? { label: f.button_label, url: f.button_url } : null);
  await sb.from("inbox_flows").update({ runs: f.runs + 1, last_run_at: now() }).eq("id", f.id);
}

/* ------------------------------------------------------------------ disparos do WhatsApp (modelo para uma lista) */
export async function createBroadcast(ctx: ChannelCtx, p: Json) {
  const name = String(p.name ?? "").trim().slice(0, 120) || "Disparo";
  const templateId = String(p.templateId ?? "");
  const { data: tpl } = await ctx.sb.from("wa_templates").select("id, name, status").eq("workspace_id", ctx.ws).eq("id", templateId).maybeSingle();
  if (!tpl) throw new PlatformError("Escolha um modelo.");
  if (tpl.status !== "APPROVED") throw new PlatformError("O modelo precisa estar aprovado pela Meta.");
  const seen = new Set<string>();
  const list = (Array.isArray(p.recipients) ? p.recipients : []).map((r) => ({ phone: String((r as Json).phone ?? "").replace(/\D/g, ""), name: String((r as Json).name ?? "").trim().slice(0, 120) || null }))
    .filter((r) => r.phone.length >= 10 && r.phone.length <= 15 && !seen.has(r.phone) && seen.add(r.phone));
  if (!list.length) throw new PlatformError("Nenhum número válido. Use DDI + DDD + número, um por linha.");
  if (list.length > 5000) throw new PlatformError("Até 5.000 números por disparo.");
  const params = (Array.isArray(p.params) ? p.params : []).map((x) => String(x).slice(0, 500));
  const { data: camp, error } = await ctx.sb.from("msg_campaigns").insert({ workspace_id: ctx.ws, name, channel_account_id: p.accountId ? String(p.accountId) : null, template_id: tpl.id, template_name: tpl.name, params, status: "enviando", total: list.length, created_by: ctx.userId, started_at: now() }).select("id").single();
  if (error || !camp) throw new Error(error?.message ?? "Não foi possível criar o disparo.");
  for (let i = 0; i < list.length; i += 500) {
    const { error: e } = await ctx.sb.from("msg_campaign_recipients").insert(list.slice(i, i + 500).map((r) => ({ workspace_id: ctx.ws, campaign_id: camp.id, phone: r.phone, name: r.name })));
    if (e) throw new Error(e.message);
  }
  await processBroadcasts(ctx.sb, ctx.env, 50_000, camp.id as string);
  const { data: final } = await ctx.sb.from("msg_campaigns").select("status, sent, failed, total").eq("id", camp.id).single();
  return { id: camp.id, ...final };
}

/** Envia os destinatários pendentes (respeitando um orçamento de tempo); o cron continua de onde parou. */
export async function processBroadcasts(sb: SupabaseClient, env: Env, budgetMs: number, onlyId?: string) {
  const started = Date.now();
  let q = sb.from("msg_campaigns").select("id, workspace_id, channel_account_id, template_id, params, sent, failed, total").eq("status", "enviando").order("created_at").limit(5);
  if (onlyId) q = q.eq("id", onlyId);
  const { data: camps } = await q;
  let total = 0;
  for (const c of camps ?? []) {
    let sent = c.sent as number, failed = c.failed as number;
    const ctx: ChannelCtx = { sb, env, ws: c.workspace_id as string, userId: null };
    while (Date.now() - started < budgetMs) {
      const { data: batch } = await sb.from("msg_campaign_recipients").select("id, phone, name").eq("campaign_id", c.id).eq("status", "pendente").limit(25);
      if (!batch?.length) break;
      for (const r of batch) {
        if (Date.now() - started >= budgetMs) break;
        const nome = (r.name as string | null) ?? "";
        const params = ((c.params as string[]) ?? []).map((x) => x.replace(/\{\{\s*nome\s*\}\}/gi, nome || "cliente").replace(/\{\{\s*primeiro_nome\s*\}\}/gi, nome.split(" ")[0] || "cliente"));
        try {
          if (!c.template_id) throw new PlatformError("O modelo foi excluído.");
          const res = await sendTemplate(ctx, { templateId: c.template_id as string, to: r.phone as string, bodyParams: params, contactName: nome, accountId: (c.channel_account_id as string | null) ?? undefined });
          await sb.from("msg_campaign_recipients").update({ status: "enviada", external_id: res.id, sent_at: now() }).eq("id", r.id);
          sent++;
        } catch (e) {
          await sb.from("msg_campaign_recipients").update({ status: "falhou", error: msg(e).slice(0, 300) }).eq("id", r.id);
          failed++;
          if (e instanceof PlatformError && e.expired) { await sb.from("msg_campaigns").update({ status: "falhou", sent, failed, finished_at: now() }).eq("id", c.id); break; }
        }
        total++;
      }
      await sb.from("msg_campaigns").update({ sent, failed }).eq("id", c.id);
    }
    const { count: pending } = await sb.from("msg_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "pendente");
    if (!pending) await sb.from("msg_campaigns").update({ status: sent ? "concluida" : "falhou", sent, failed, finished_at: now() }).eq("id", c.id).eq("status", "enviando");
  }
  return { enviados: total };
}

/* ------------------------------------------------------------------ estatísticas das publicações do Instagram */
/** Atualiza as estatísticas das publicações das contas do Instagram do espaço (usado pelos agentes). */
export async function refreshMediaStats(sb: SupabaseClient, env: Env, ws: string, accountId?: string) {
  let q = sb.from("channel_accounts").select(ACCOUNT_COLS).eq("workspace_id", ws).eq("kind", "instagram").eq("status", "ativo");
  if (accountId) q = q.eq("id", accountId);
  const { data: accs } = await q;
  const out: Record<string, number | string> = {};
  for (const acc of (accs ?? []) as Account[]) {
    try { out[acc.name] = await syncMediaStats(sb, env, tokenOf(await channelAuth(sb, env, "instagram", acc.connection_id)), acc); }
    catch (e) { out[acc.name] = `erro: ${msg(e)}`; }
  }
  return out;
}
async function syncMediaStats(sb: SupabaseClient, env: Env, token: string, acc: Account) {
  const media = await IG.igRecentMedia(env, token, 25);
  const rows = [];
  for (const m of media) {
    const ins = await IG.igMediaInsights(env, token, m.id, m.media_type);
    rows.push({ channel_account_id: acc.id, media_id: m.id, workspace_id: acc.workspace_id, caption: m.caption ?? null, permalink: m.permalink ?? null, thumbnail: m.thumbnail_url ?? m.media_url ?? null, media_type: m.media_type ?? null, posted_at: m.timestamp ?? null, likes: m.like_count ?? 0, comments: m.comments_count ?? 0, reach: ins.reach ?? null, views: ins.views ?? null, saved: ins.saved ?? null, shares: ins.shares ?? null, updated_at: now() });
  }
  if (rows.length) await sb.from("social_media_stats").upsert(rows, { onConflict: "channel_account_id,media_id" });
  return rows.length;
}
