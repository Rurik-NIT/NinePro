/**
 * Validação antes de publicar.
 *  - validateMedia(url): a mídia abre? É mesmo imagem/vídeo (pelos bytes, não pela extensão)? Tamanho, dimensões,
 *    duração (MP4/MOV) e comparação com o limite de cada rede. Recusa endereços privados (proteção SSRF).
 *  - countText(text): caracteres por rede, com a contagem ponderada do X (link = 23, emoji = 2).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CHANNELS, graphemes, type ChannelId } from "./platforms/index.js";

const MB = 1024 * 1024;
/** Limites de arquivo e de vídeo por rede (valores publicados por cada plataforma). */
export const MEDIA_LIMITS: Partial<Record<ChannelId, { imageMB: number; videoMB: number; videoMaxSec?: number; videoMinSec?: number; formats: string[]; ratio?: [number, number] }>> = {
  instagram: { imageMB: 8, videoMB: 1024, videoMaxSec: 900, videoMinSec: 3, formats: ["jpeg", "mp4", "mov"], ratio: [0.8, 1.91] },
  facebook: { imageMB: 10, videoMB: 1024, videoMaxSec: 14400, formats: ["jpeg", "png", "gif", "webp", "mp4", "mov"] },
  threads: { imageMB: 8, videoMB: 1024, videoMaxSec: 300, formats: ["jpeg", "png", "mp4", "mov"] },
  linkedin_social: { imageMB: 36, videoMB: 500, videoMaxSec: 900, videoMinSec: 3, formats: ["jpeg", "png", "gif", "mp4"] },
  youtube: { imageMB: 0, videoMB: 1500, formats: ["mp4", "mov", "webm"] },
  tiktok_social: { imageMB: 20, videoMB: 4096, videoMaxSec: 600, videoMinSec: 3, formats: ["jpeg", "webp", "mp4", "mov", "webm"] },
  x: { imageMB: 5, videoMB: 512, videoMaxSec: 140, formats: ["jpeg", "png", "gif", "webp", "mp4", "mov"] },
  telegram: { imageMB: 10, videoMB: 50, formats: ["jpeg", "png", "gif", "webp", "mp4", "mov"] },
  discord: { imageMB: 25, videoMB: 25, formats: ["jpeg", "png", "gif", "webp", "mp4", "mov", "webm"] },
  bluesky: { imageMB: 1, videoMB: 100, videoMaxSec: 180, formats: ["jpeg", "png", "webp", "mp4"] },
};

/* ------------------------------------------------------------------ segurança do endereço */
const privateV4 = (ip: string) => { const [a, b] = ip.split(".").map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; };
const privateV6 = (ip: string) => { const s = ip.toLowerCase(); return s === "::1" || s === "::" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80") || s.startsWith("::ffff:127.") || s.startsWith("::ffff:10.") || s.startsWith("::ffff:192.168."); };
async function publicUrl(raw: string): Promise<URL | string> {
  let u: URL; try { u = new URL(raw); } catch { return "Endereço inválido."; }
  if (!["https:", "http:"].includes(u.protocol)) return "Use um endereço http(s) público.";
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) return "Endereços internos não são aceitos.";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : await lookup(host, { all: true }).then((r) => r.map((x) => x.address)).catch(() => []);
  if (!ips.length) return "Não foi possível encontrar o servidor do endereço.";
  if (ips.some((ip) => (isIP(ip) === 6 ? privateV6(ip) : privateV4(ip)))) return "Endereços internos não são aceitos.";
  return u;
}

/* ------------------------------------------------------------------ leitura dos bytes */
const be16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const le16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const le24 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

export function sniff(b: Uint8Array): { kind: "image" | "video" | "pdf"; format: string } | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", format: "jpeg" };
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return { kind: "image", format: "png" };
  if (ascii(b, 0, 4) === "GIF8") return { kind: "image", format: "gif" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { kind: "image", format: "webp" };
  if (ascii(b, 4, 4) === "ftyp") { const brand = ascii(b, 8, 4); return brand.startsWith("qt") ? { kind: "video", format: "mov" } : /^(heic|heix|mif1|avif)/.test(brand) ? { kind: "image", format: brand.startsWith("avif") ? "avif" : "heic" } : { kind: "video", format: "mp4" }; }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: "video", format: "webm" };
  if (ascii(b, 0, 4) === "%PDF") return { kind: "pdf", format: "pdf" };
  return null;
}
export function imageSize(b: Uint8Array, format: string): { width: number; height: number } | null {
  try {
    if (format === "png") return { width: be32(b, 16), height: be32(b, 20) };
    if (format === "gif") return { width: le16(b, 6), height: le16(b, 8) };
    if (format === "webp") {
      const c = ascii(b, 12, 4);
      if (c === "VP8 ") return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
      if (c === "VP8L") { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
      if (c === "VP8X") return { width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
    }
    if (format === "jpeg") {
      let o = 2;
      while (o < b.length - 9) {
        if (b[o] !== 0xff) { o++; continue; }
        const marker = b[o + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: be16(b, o + 7), height: be16(b, o + 5) };
        o += 2 + be16(b, o + 2);
      }
    }
  } catch { /* cabeçalho incompleto */ }
  return null;
}
/** MP4/MOV: duração (mvhd) e dimensões da faixa de vídeo (tkhd), quando o moov está no trecho lido. */
export function mp4Info(b: Uint8Array): { duration?: number; width?: number; height?: number } {
  const out: { duration?: number; width?: number; height?: number } = {};
  const walk = (start: number, end: number, depth: number) => {
    let o = start;
    while (o + 8 <= end && depth < 6) {
      let size = be32(b, o); const type = ascii(b, o + 4, 4); let header = 8;
      if (size === 1) { size = be32(b, o + 12) + be32(b, o + 8) * 2 ** 32; header = 16; }
      if (size === 0) size = end - o;
      if (size < header) return;
      const body = o + header;
      if (type === "mvhd" && body + 32 <= b.length) {
        const v = b[body];
        const scale = v === 1 ? be32(b, body + 20) : be32(b, body + 12);
        const dur = v === 1 ? be32(b, body + 24) * 2 ** 32 + be32(b, body + 28) : be32(b, body + 16);
        if (scale) out.duration = Math.round((dur / scale) * 10) / 10;
      } else if (type === "tkhd" && body + 92 <= b.length) {
        const v = b[body]; const off = v === 1 ? body + 88 : body + 76;
        const w = be32(b, off) / 65536, h = be32(b, off + 4) / 65536;
        if (w && h && !out.width) { out.width = Math.round(w); out.height = Math.round(h); }
      } else if (["moov", "trak", "mdia"].includes(type)) walk(body, Math.min(o + size, b.length), depth + 1);
      o += size;
    }
  };
  walk(0, b.length, 0);
  return out;
}

async function readRange(url: URL, maxBytes: number) {
  const res = await fetch(url, { headers: { range: `bytes=0-${maxBytes - 1}`, "user-agent": "NinePro-Validator/1.0" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get("content-range")?.split("/")[1] ?? res.headers.get("content-length") ?? 0) || null;
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = []; let got = 0;
  while (reader && got < maxBytes) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.byteLength; }
  await reader?.cancel().catch(() => undefined);
  const bytes = new Uint8Array(Math.min(got, maxBytes)); let o = 0;
  for (const c of chunks) { const part = c.subarray(0, Math.min(c.byteLength, bytes.length - o)); bytes.set(part, o); o += part.byteLength; if (o >= bytes.length) break; }
  return { bytes, total: total ?? (got < maxBytes ? got : null), type: res.headers.get("content-type")?.split(";")[0] ?? "" };
}

export interface MediaCheck { valido: boolean; url: string; erro?: string; codigo?: "MIDIA_INVALIDA" | "MIDIA_INACESSIVEL" | "ENDERECO_NAO_PERMITIDO"; tipo?: "image" | "video" | "pdf"; formato?: string; tamanho_mb?: number | null; largura?: number; altura?: number; proporcao?: number; duracao_s?: number; redes?: Record<string, { ok: boolean; motivos: string[] }> }
export async function validateMedia(raw: string, kinds?: ChannelId[]): Promise<MediaCheck> {
  const url = await publicUrl(raw);
  if (typeof url === "string") return { valido: false, url: raw, erro: url, codigo: "ENDERECO_NAO_PERMITIDO" };
  let r: Awaited<ReturnType<typeof readRange>>;
  try { r = await readRange(url, 4 * MB); } catch (e) { return { valido: false, url: raw, erro: `A mídia não abriu (${e instanceof Error ? e.message : String(e)}). Use um link público direto para o arquivo.`, codigo: "MIDIA_INACESSIVEL" }; }
  const kind = sniff(r.bytes);
  if (!kind) return { valido: false, url: raw, erro: /text\/html/.test(r.type) ? "O endereço abre uma página, não o arquivo. Use o link direto da imagem ou do vídeo." : "O arquivo não é uma imagem, vídeo ou PDF válido.", codigo: r.type.includes("html") ? "MIDIA_INACESSIVEL" : "MIDIA_INVALIDA" };
  const size = r.total;
  const dims = kind.kind === "image" ? imageSize(r.bytes, kind.format) : null;
  const vid = kind.kind === "video" && kind.format !== "webm" ? mp4Info(r.bytes) : {};
  const width = dims?.width ?? vid.width, height = dims?.height ?? vid.height;
  const out: MediaCheck = { valido: true, url: raw, tipo: kind.kind, formato: kind.format, tamanho_mb: size ? Math.round((size / MB) * 100) / 100 : null, ...(width && height ? { largura: width, altura: height, proporcao: Math.round((width / height) * 100) / 100 } : {}), ...(vid.duration ? { duracao_s: vid.duration } : {}) };
  const redes: Record<string, { ok: boolean; motivos: string[] }> = {};
  for (const k of kinds?.length ? kinds : (Object.keys(MEDIA_LIMITS) as ChannelId[])) {
    const l = MEDIA_LIMITS[k]; if (!l) continue;
    const motivos: string[] = [];
    const maxMB = kind.kind === "video" ? l.videoMB : l.imageMB;
    if (kind.kind === "pdf") motivos.push("PDF não é publicado como mídia.");
    else if (!maxMB) motivos.push(kind.kind === "image" ? "não aceita imagem" : "não aceita vídeo");
    else if (size && size > maxMB * MB) motivos.push(`arquivo de ${out.tamanho_mb} MB (máximo ${maxMB >= 1024 ? `${maxMB / 1024} GB` : `${maxMB} MB`})`);
    if (kind.kind !== "pdf" && !l.formats.includes(kind.format)) motivos.push(`formato ${kind.format.toUpperCase()} não aceito (use ${l.formats.map((f) => f.toUpperCase()).join(", ")})`);
    if (vid.duration && l.videoMaxSec && vid.duration > l.videoMaxSec) motivos.push(`vídeo de ${Math.round(vid.duration)} s (máximo ${l.videoMaxSec >= 60 ? `${l.videoMaxSec / 60} min` : `${l.videoMaxSec} s`})`);
    if (vid.duration && l.videoMinSec && vid.duration < l.videoMinSec) motivos.push(`vídeo de ${vid.duration} s (mínimo ${l.videoMinSec} s)`);
    if (k === "instagram" && kind.kind === "image" && out.proporcao && l.ratio && (out.proporcao < l.ratio[0] || out.proporcao > l.ratio[1])) motivos.push(`proporção ${out.proporcao}:1 fora do feed (de 4:5 a 1,91:1); como story ou reels use 9:16`);
    redes[CHANNELS[k]?.label ?? k] = { ok: !motivos.length, motivos };
  }
  out.redes = redes;
  return out;
}

/* ------------------------------------------------------------------ contagem de caracteres */
const URL_RE = /https?:\/\/[^\s]+/g;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
/** Contagem do X: links valem 23, emojis e ideogramas valem 2. */
export function xWeighted(text: string) {
  let n = 0;
  const noUrls = text.replace(URL_RE, () => { n += 23; return ""; });
  for (const g of new Intl.Segmenter("pt", { granularity: "grapheme" }).segment(noUrls)) n += EMOJI_RE.test(g.segment) || /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-￯]/.test(g.segment) ? 2 : 1;
  return n;
}
export function countText(text: string, kinds?: ChannelId[]) {
  const list = kinds?.length ? kinds : (Object.keys(CHANNELS) as ChannelId[]).filter((k) => CHANNELS[k].limits);
  const hashtags = (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
  const mentions = (text.match(/(^|\s)@[\w.]+/g) ?? []).length;
  return {
    caracteres: graphemes(text), hashtags, mencoes: mentions,
    redes: list.map((k) => {
      const limit = CHANNELS[k].limits!.text;
      const count = k === "x" ? xWeighted(text) : graphemes(text);
      const avisos: string[] = [];
      if (k === "instagram" && hashtags > 30) avisos.push(`${hashtags} hashtags (máximo 30)`);
      if (k === "instagram" && mentions > 20) avisos.push(`${mentions} menções (máximo 20)`);
      if (k === "x" && count > 280) avisos.push("acima de 280: só contas Premium (até 25.000)");
      return { rede: k, nome: CHANNELS[k].label, contagem: count, limite: limit, dentro: count <= limit, sobra: limit - count, ...(avisos.length ? { avisos } : {}) };
    }),
  };
}
