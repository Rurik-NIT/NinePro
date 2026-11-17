/**
 * Discord — webhooks de canal (Integrações › Webhooks). Publica texto, imagens e vídeo no canal.
 * Conexão só por token: as URLs dos webhooks, uma por canal.
 */
import { blob, download, http, PlatformError, type ChannelProvider, type StoredAuth } from "./types.js";

interface Hook { id: string; url: string; name: string; channel_id: string; guild_id?: string }
const RE = /^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/(?:v\d+\/)?webhooks\/(\d+)\/([\w-]+)$/;
const hooksOf = (a: StoredAuth): Hook[] => { try { return JSON.parse(a.extra?.webhooks ?? "[]") as Hook[]; } catch { return []; } };
const VIDEO_MAX = 25_000_000;

export const discordProvider: ChannelProvider = {
  id: "discord",
  label: "Discord",
  tokenOnly: true,
  limits: { text: 2000, images: 10, videos: 1, textOnly: true, mixed: true },
  nineproApp: () => null,
  scopes: () => [],
  appFields: [],
  tokenFields: [{ key: "webhooks", label: "URLs dos webhooks", multiline: true, placeholder: "https://discord.com/api/webhooks/…", hint: "No canal: Editar canal › Integrações › Webhooks › Novo webhook › Copiar URL. Uma por linha." }],
  authorizeUrl() { throw new PlatformError("O Discord conecta pela URL do webhook do canal."); },
  async exchangeCode() { throw new PlatformError("O Discord conecta pela URL do webhook do canal."); },
  async fromToken(_env, f) {
    const urls = [...new Set((f.webhooks ?? "").split(/\s+/).map((u) => u.trim()).filter(Boolean))];
    if (!urls.length) throw new PlatformError("Cole ao menos uma URL de webhook.");
    const hooks: Hook[] = [];
    for (const url of urls) {
      if (!RE.test(url)) throw new PlatformError(`URL de webhook inválida: ${url.slice(0, 60)}…`);
      const h = await http<{ id: string; name: string; channel_id: string; guild_id?: string }>("Discord", url, undefined, (s) => s === 401 || s === 404);
      hooks.push({ id: h.id, url, name: h.name, channel_id: h.channel_id, guild_id: h.guild_id });
    }
    return { auth: { accessToken: "webhooks", extra: { webhooks: JSON.stringify(hooks) } }, expiresAt: null, user: { id: hooks[0].guild_id ?? hooks[0].id, name: hooks.map((h) => h.name).join(", ").slice(0, 80) }, scopes: [] };
  },
  async ready(_env, auth) { return auth; },
  async discover(_env, auth) {
    const out = [];
    for (const h of hooksOf(auth)) {
      try {
        const r = await http<{ name: string; channel_id: string }>("Discord", h.url, undefined, (s) => s === 401 || s === 404);
        out.push({ externalId: h.id, name: r.name, displayName: `Canal ${r.channel_id}`, status: "ativo", detail: { canal: r.channel_id, servidor: h.guild_id ?? null } });
      } catch (e) {
        out.push({ externalId: h.id, name: h.name, status: "erro", detail: { aviso: e instanceof Error ? e.message : String(e) } });
      }
    }
    return out;
  },
  async subscribe() { return null; },
  async publish(_env, auth, account, p) {
    const h = hooksOf(auth).find((x) => x.id === account.externalId);
    if (!h) throw new PlatformError("Discord: webhook não encontrado. Conecte de novo.", true);
    const images = p.media.filter((m) => m.type === "image").slice(0, 10);
    const videos = p.media.filter((m) => m.type === "video");
    let content = p.text.trim();
    let aviso: string | undefined;
    const payload: Record<string, unknown> = { embeds: images.map((m) => ({ image: { url: m.url } })), allowed_mentions: { parse: [] } };
    const fd = new FormData();
    if (videos.length) {
      try {
        const f = await download("Discord", videos[0].url, VIDEO_MAX);
        fd.set("files[0]", blob(f.bytes, f.type), f.name || "video.mp4");
      } catch { content = `${content}\n${videos[0].url}`.trim(); aviso = "Vídeo maior que 25 MB: enviado como link."; }
    }
    payload.content = content.slice(0, 2000);
    const url = `${h.url}?wait=true`;
    const msg = fd.has("files[0]")
      ? (fd.set("payload_json", JSON.stringify(payload)), await http<{ id: string; channel_id: string }>("Discord", url, { method: "POST", body: fd }))
      : await http<{ id: string; channel_id: string }>("Discord", url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return { id: msg.id, permalink: h.guild_id ? `https://discord.com/channels/${h.guild_id}/${msg.channel_id}/${msg.id}` : null, aviso };
  },
};
