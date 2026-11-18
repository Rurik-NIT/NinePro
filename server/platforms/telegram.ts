/**
 * Telegram — Bot API. Publica em canais e grupos onde o bot é administrador.
 * Conexão só por token: o token do bot (BotFather) e os canais (@canal ou ID -100…).
 */
import { blob, download, http, optBool, optStr, PlatformError, type ChannelProvider, type NetOptions, type PublishInput, type StoredAuth } from "./types.js";

/** Opções comuns a todo envio (formatação, notificação, proteção). */
const sendOpts = (o?: NetOptions) => { const pm = optStr(o, "formatacao"); return { ...(pm && pm !== "nenhuma" ? { parse_mode: pm } : {}), ...(optBool(o, "silencioso") ? { disable_notification: true } : {}), ...(optBool(o, "proteger") ? { protect_content: true } : {}) }; };

const api = (t: string) => `https://api.telegram.org/bot${t}`;
const tokenOf = (a: StoredAuth) => { if (!a.accessToken) throw new PlatformError("Telegram: conexão sem token do bot.", true); return a.accessToken; };
async function tg<T>(token: string, method: string, body: Record<string, unknown> | FormData): Promise<T> {
  const init: RequestInit = body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const r = await http<{ ok: boolean; result: T }>("Telegram", `${api(token)}/${method}`, init, (s) => s === 401);
  return r.result;
}
const chatsOf = (raw: string) => [...new Set(raw.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean).map((c) => (/^-?\d+$/.test(c) || c.startsWith("@") ? c : c.replace(/^https?:\/\/t\.me\//, "@"))))];
interface Chat { id: number; title?: string; username?: string; type: string; first_name?: string }
interface Msg { message_id: number; chat: Chat }

const link = (chat: Record<string, unknown>, id: number) => (chat.usuario ? `https://t.me/${String(chat.usuario)}/${id}` : null);

/** Envia a mídia pelo link; se o Telegram não conseguir buscar (arquivo grande), envia o arquivo. */
async function sendOne(token: string, chat: string, m: PublishInput["media"][number], caption?: string, extra: Record<string, unknown> = {}): Promise<Msg> {
  const method = m.type === "video" ? "sendVideo" : "sendPhoto";
  const field = m.type === "video" ? "video" : "photo";
  try {
    return await tg<Msg>(token, method, { chat_id: chat, [field]: m.url, ...(caption ? { caption } : {}), ...(m.type === "video" ? { supports_streaming: true } : {}), ...extra });
  } catch (e) {
    if (!(e instanceof PlatformError) || e.expired) throw e;
    const f = await download("Telegram", m.url, 50_000_000);
    const fd = new FormData();
    fd.set("chat_id", chat); if (caption) fd.set("caption", caption);
    if (m.type === "video") fd.set("supports_streaming", "true");
    for (const [k, v] of Object.entries(extra)) fd.set(k, String(v));
    fd.set(field, blob(f.bytes, f.type), f.name);
    return tg<Msg>(token, method, fd);
  }
}

export const telegramProvider: ChannelProvider = {
  id: "telegram",
  label: "Telegram",
  tokenOnly: true,
  limits: { text: 4096, images: 10, videos: 10, textOnly: true, mixed: true },
  nineproApp: () => null,
  scopes: () => [],
  appFields: [],
  tokenFields: [
    { key: "accessToken", label: "Token do bot", secret: true, placeholder: "123456789:AA…", pattern: "^\\d{5,}:[\\w-]{30,}$", hint: "No Telegram, fale com @BotFather › /newbot e copie o token." },
    { key: "chats", label: "Canais ou grupos", multiline: true, placeholder: "@meucanal\n-1001234567890", hint: "Um por linha. Adicione o bot como administrador com permissão de publicar." },
  ],
  authorizeUrl() { throw new PlatformError("O Telegram conecta só pelo token do bot."); },
  async exchangeCode() { throw new PlatformError("O Telegram conecta só pelo token do bot."); },
  async fromToken(_env, f) {
    const token = (f.accessToken ?? "").trim();
    const chats = chatsOf(f.chats ?? "");
    if (!chats.length) throw new PlatformError("Informe ao menos um canal ou grupo (@canal ou ID).");
    const me = await tg<{ id: number; username: string; first_name: string }>(token, "getMe", {});
    return { auth: { accessToken: token, extra: { chats: chats.join(","), botId: String(me.id) } }, expiresAt: null, user: { id: String(me.id), name: `@${me.username}` }, scopes: [] };
  },
  async ready(_env, auth) { return auth; },
  async discover(_env, auth) {
    const token = tokenOf(auth);
    const out = [];
    for (const c of chatsOf(auth.extra?.chats ?? "")) {
      try {
        const chat = await tg<Chat>(token, "getChat", { chat_id: c });
        let status = "ativo"; let aviso: string | null = null;
        try {
          const m = await tg<{ status: string; can_post_messages?: boolean }>(token, "getChatMember", { chat_id: chat.id, user_id: Number(auth.extra?.botId) });
          const admin = m.status === "administrator" || m.status === "creator";
          if (chat.type === "channel" && (!admin || m.can_post_messages === false)) { status = "sem permissão"; aviso = "Torne o bot administrador do canal com permissão de publicar."; }
          if (chat.type !== "channel" && ["left", "kicked"].includes(m.status)) { status = "sem permissão"; aviso = "Adicione o bot ao grupo."; }
        } catch { /* alguns grupos não deixam consultar membros */ }
        out.push({ externalId: String(chat.id), name: chat.username ? `@${chat.username}` : chat.title ?? chat.first_name ?? String(chat.id), displayName: chat.title ?? null, status, detail: { tipo: chat.type, usuario: chat.username ?? null, aviso } });
      } catch (e) {
        out.push({ externalId: c, name: c, status: "erro", detail: { aviso: e instanceof Error ? e.message : String(e) } });
      }
    }
    return out;
  },
  async subscribe() { return null; },
  async publish(_env, auth, account, p) {
    const token = tokenOf(auth);
    const chat = account.externalId;
    const text = p.text.trim();
    const extra = sendOpts(p.options);
    const preview = optBool(p.options, "sem_previa_de_link") ? { link_preview_options: { is_disabled: true } } : {};
    if (!p.media.length) {
      const m = await tg<Msg>(token, "sendMessage", { chat_id: chat, text, ...extra, ...preview });
      return { id: String(m.message_id), permalink: link(account.detail, m.message_id) };
    }
    // legenda vai até 1.024 caracteres; texto maior segue numa mensagem logo depois
    const caption = text.length <= 1024 ? text : "";
    let first: Msg;
    if (p.media.length === 1) first = await sendOne(token, chat, p.media[0], caption || undefined, extra);
    else {
      const { parse_mode, ...rest } = extra as { parse_mode?: string };
      const group = p.media.slice(0, 10).map((m, i) => ({ type: m.type === "video" ? "video" : "photo", media: m.url, ...(i === 0 && caption ? { caption, ...(parse_mode ? { parse_mode } : {}) } : {}) }));
      first = (await tg<Msg[]>(token, "sendMediaGroup", { chat_id: chat, media: group, ...rest }))[0];
    }
    if (!caption && text) await tg<Msg>(token, "sendMessage", { chat_id: chat, text, ...extra, ...preview });
    return { id: String(first.message_id), permalink: link(account.detail, first.message_id) };
  },
};
