import { AtSign, Cloud, Facebook, Instagram, Linkedin, MessageCircle, MessagesSquare, Music2, Send, Twitter, Youtube } from "lucide-react";

/** Canais e redes de publicação (espelho de server/platforms → CHANNELS). */
export type ChannelKind = "whatsapp" | "instagram" | "facebook" | "threads" | "linkedin_social" | "youtube" | "tiktok_social" | "x" | "telegram" | "discord" | "bluesky";
export const SOCIAL_KINDS: ChannelKind[] = ["facebook", "threads", "linkedin_social", "youtube", "tiktok_social", "x", "telegram", "discord", "bluesky"];
export const PUBLISH_KINDS: ChannelKind[] = ["instagram", ...SOCIAL_KINDS];

export interface NetLimits { text: number; images: number; videos: number; textOnly: boolean; mixed: boolean; needsVideo?: boolean; needsTitle?: boolean }
interface Net { label: string; icon: JSX.Element; does: string[]; limits?: NetLimits }
export const NETWORK: Record<ChannelKind, Net> = {
  whatsapp: { label: "WhatsApp", icon: <MessageCircle />, does: ["Mensagens recebidas", "Respostas", "Modelos", "Status de entrega"] },
  instagram: { label: "Instagram", icon: <Instagram />, does: ["Mensagens diretas", "Comentários", "Menções", "Publicação"], limits: { text: 2200, images: 10, videos: 10, textOnly: false, mixed: true } },
  facebook: { label: "Facebook", icon: <Facebook />, does: ["Publicar na Página", "Fotos e vídeos", "Agendar"], limits: { text: 63206, images: 10, videos: 1, textOnly: true, mixed: false } },
  threads: { label: "Threads", icon: <AtSign />, does: ["Publicar texto", "Fotos, vídeos e carrossel", "Agendar"], limits: { text: 500, images: 20, videos: 20, textOnly: true, mixed: true } },
  linkedin_social: { label: "LinkedIn", icon: <Linkedin />, does: ["Publicar no perfil", "Publicar na Página da empresa", "Fotos e vídeo"], limits: { text: 3000, images: 20, videos: 1, textOnly: true, mixed: false } },
  youtube: { label: "YouTube", icon: <Youtube />, does: ["Enviar vídeos e Shorts", "Título e descrição", "Agendar"], limits: { text: 5000, images: 0, videos: 1, textOnly: false, mixed: false, needsVideo: true, needsTitle: true } },
  tiktok_social: { label: "TikTok", icon: <Music2 />, does: ["Publicar vídeos", "Publicar fotos", "Agendar"], limits: { text: 2200, images: 35, videos: 1, textOnly: false, mixed: false } },
  x: { label: "X (Twitter)", icon: <Twitter />, does: ["Publicar posts", "Até 4 fotos ou 1 vídeo", "Agendar"], limits: { text: 280, images: 4, videos: 1, textOnly: true, mixed: false } },
  telegram: { label: "Telegram", icon: <Send />, does: ["Publicar em canais e grupos", "Fotos e vídeos", "Agendar"], limits: { text: 4096, images: 10, videos: 10, textOnly: true, mixed: true } },
  discord: { label: "Discord", icon: <MessagesSquare />, does: ["Publicar em canais", "Imagens e vídeo", "Agendar"], limits: { text: 2000, images: 10, videos: 1, textOnly: true, mixed: true } },
  bluesky: { label: "Bluesky", icon: <Cloud />, does: ["Publicar posts", "Links e hashtags clicáveis", "Até 4 fotos ou 1 vídeo"], limits: { text: 300, images: 4, videos: 1, textOnly: true, mixed: false } },
};
export const graphemeCount = (s: string) => { try { return [...new Intl.Segmenter("pt", { granularity: "grapheme" }).segment(s)].length; } catch { return [...s].length; } };
export const isVideo = (u: string) => /\.(mp4|mov|m4v|webm|avi)(\?|$)/i.test(u);

/** Mesmas regras do servidor (checkPost), para avisar antes de enviar. */
export function checkDraft(kinds: ChannelKind[], d: { text: string; title?: string; custom?: Record<string, string>; media: string[] }) {
  const problemas: string[] = [];
  const imgs = d.media.filter((u) => !isVideo(u)).length, vids = d.media.length - imgs;
  for (const k of [...new Set(kinds)]) {
    const l = NETWORK[k].limits; const name = NETWORK[k].label;
    if (!l) continue;
    const text = (d.custom?.[k] || d.text).trim(); const n = graphemeCount(text);
    if (n > l.text && k !== "x") problemas.push(`${name}: ${n}/${l.text} caracteres.`);
    if (!d.media.length && !l.textOnly) problemas.push(`${name}: precisa de ${l.needsVideo ? "um vídeo" : "foto ou vídeo"}.`);
    if (!d.media.length && !text) problemas.push(`${name}: escreva um texto ou adicione mídia.`);
    if (l.needsVideo && !vids && d.media.length) problemas.push(`${name}: precisa de um vídeo.`);
    if (!l.images && imgs) problemas.push(`${name}: não aceita imagens.`);
    if (vids > l.videos) problemas.push(`${name}: no máximo ${l.videos} vídeo(s).`);
    if (imgs && vids && !l.mixed) problemas.push(`${name}: não mistura fotos e vídeo.`);
    if (l.needsTitle && !(d.title?.trim() || text)) problemas.push(`${name}: informe o título.`);
  }
  return [...new Set(problemas)];
}
