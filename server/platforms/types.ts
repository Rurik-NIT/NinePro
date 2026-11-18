/**
 * Contrato comum das plataformas de anúncio. Cada plataforma traduz a própria API para estes
 * formatos; o restante do NinePro (sincronização, telas, agentes) não conhece detalhes de API.
 */
export type Env = Record<string, string | undefined>;
export type PlatformId = "meta" | "google" | "tiktok" | "linkedin";
/** Redes em que o NinePro só publica (sem caixa de entrada por enquanto). */
export type SocialId = "facebook" | "threads" | "linkedin_social" | "youtube" | "tiktok_social" | "x" | "telegram" | "discord" | "bluesky" | "pinterest" | "google_business" | "slack";
export type ChannelId = "whatsapp" | "instagram" | SocialId;
export type ConnectorId = PlatformId | ChannelId;
export type AuthMode = "app_ninepro" | "app_proprio" | "token";
export type Objective = "vendas" | "leads" | "trafego" | "reconhecimento";
export type Delivery = "active" | "learning" | "limited" | "paused" | "ended";

/** Credenciais do app (OAuth). Campos extras por plataforma (ex.: developer token do Google). */
export interface AppCreds { appId: string; appSecret: string; extra?: Record<string, string> }
/** O que fica guardado (criptografado) depois da conexão. */
export interface StoredAuth { accessToken?: string; refreshToken?: string; app?: AppCreds; extra?: Record<string, string> }

export interface ConnectedUser { id: string; name: string }
export interface ExchangeResult { auth: StoredAuth; expiresAt: string | null; user: ConnectedUser; scopes: string[] }

export interface NAccount { externalId: string; name: string; currency: string; timezone: string; active: boolean; parentExternalId?: string | null }
export interface NCampaign { externalId: string; name: string; objective: Objective; status: Delivery; budget: number; budgetType: "diario" | "total"; startedAt: string | null }
export interface NAdSet { externalId: string; campaignExternalId: string; name: string; status: Delivery; audience: string | null }
export interface NAd { externalId: string; adSetExternalId: string; name: string; status: Delivery; format: "Imagem" | "Vídeo" | "Carrossel"; thumbnail: string | null }
export interface NInsight { adExternalId: string; date: string; spend: number; impressions: number; reach: number; clicks: number; link_clicks: number; conversions: number; leads: number; purchases: number; revenue: number }

/** Campo pedido ao cliente no modal de conexão. */
export interface CredField { key: string; label: string; secret?: boolean; placeholder?: string; hint?: string; pattern?: string; multiline?: boolean; optional?: boolean }

/** Parte comum a toda conexão: como autorizar (OAuth, app próprio ou token). */
export interface Connector {
  id: ConnectorId;
  label: string;
  /** App do NinePro disponível (variáveis de ambiente preenchidas)? */
  nineproApp(env: Env): AppCreds | null;
  scopes(env: Env): string[];
  /** Campos do "app da sua empresa" (além do redirecionamento OAuth) e do "token de acesso". */
  appFields: CredField[];
  tokenFields: CredField[];
  authorizeUrl(env: Env, app: AppCreds, redirectUri: string, state: string): string;
  exchangeCode(env: Env, app: AppCreds, code: string, redirectUri: string, state?: string): Promise<ExchangeResult>;
  /** Valida e monta a autenticação a partir dos campos do modo "token". */
  fromToken(env: Env, fields: Record<string, string>): Promise<ExchangeResult>;
  /** Devolve uma autenticação pronta para chamar a API (renova o token quando preciso). */
  ready(env: Env, auth: StoredAuth): Promise<StoredAuth>;
}

/** Plataforma de anúncios. */
export interface Provider extends Connector {
  id: PlatformId;
  accounts(env: Env, auth: StoredAuth): Promise<NAccount[]>;
  structure(env: Env, auth: StoredAuth, account: NAccount): Promise<{ campaigns: NCampaign[]; adSets: NAdSet[]; ads: NAd[] }>;
  insights(env: Env, auth: StoredAuth, account: NAccount, since: string, until: string): Promise<NInsight[]>;
  setCampaignStatus(env: Env, auth: StoredAuth, account: NAccount, campaignExternalId: string, status: "active" | "paused"): Promise<void>;
  /** Altera o orçamento diário da campanha (na moeda da conta). Ausente = plataforma não suportada. */
  setCampaignBudget?(env: Env, auth: StoredAuth, account: NAccount, campaignExternalId: string, dailyBudget: number): Promise<void>;
}

/** Número de WhatsApp ou conta do Instagram encontrada na conexão. */
export interface NChannelAccount { externalId: string; parentExternalId?: string | null; name: string; displayName?: string | null; picture?: string | null; status: string; quality?: string | null; detail?: Record<string, unknown> }

/** O que publicar numa conta. Mídias são URLs públicas https. */
export interface PublishMedia { url: string; type: "image" | "video" }
/** Opções da rede (ver src/config/postOptions.ts). */
export type NetOptions = Record<string, string | boolean | number | string[]>;
export interface PublishInput { text: string; title?: string; media: PublishMedia[]; format?: string; options?: NetOptions }
export interface PublishResult { id: string; permalink: string | null; aviso?: string }
/** Conta em que se publica (linha de channel_accounts). */
export interface PublishAccount { externalId: string; name: string; detail: Record<string, unknown> }
/** Uma publicação com métricas, no formato comum a todas as redes. null = a rede não informa. */
export interface PostStat { id: string; text?: string | null; permalink?: string | null; thumbnail?: string | null; type?: string | null; postedAt?: string | null; likes?: number | null; comments?: number | null; shares?: number | null; saves?: number | null; views?: number | null; impressions?: number | null; reach?: number | null; clicks?: number | null }
/** Números da conta num dia. */
export interface AccountStat { followers?: number | null; following?: number | null; posts?: number | null; impressions?: number | null; reach?: number | null; profileViews?: number | null; extra?: Record<string, number | string | null> }
/** Limites de cada rede, usados para validar antes de publicar. */
export interface SocialLimits { text: number; images: number; videos: number; textOnly: boolean; mixed: boolean; needsMedia?: "video" | "any"; needsTitle?: boolean; titleMax?: number }

/** Canal de mensagens / rede social. */
export interface ChannelProvider extends Connector {
  id: ChannelId;
  discover(env: Env, auth: StoredAuth): Promise<NChannelAccount[]>;
  /** Inscreve o app nos webhooks da conta (mensagens, comentários). Devolve aviso legível quando falha. */
  subscribe(env: Env, auth: StoredAuth, accounts: NChannelAccount[]): Promise<string | null>;
  /** Redes de publicação: publica na conta e devolve o ID e o link. */
  publish?(env: Env, auth: StoredAuth, account: PublishAccount, p: PublishInput): Promise<PublishResult>;
  /** Análises: publicações recentes da conta com métricas (de todas as origens). */
  stats?(env: Env, auth: StoredAuth, account: PublishAccount, limit: number): Promise<PostStat[]>;
  /** Análises: números da conta hoje (seguidores, alcance…). */
  accountStats?(env: Env, auth: StoredAuth, account: PublishAccount): Promise<AccountStat>;
  /** Comenta na publicação recém-criada (primeiro comentário). */
  comment?(env: Env, auth: StoredAuth, account: PublishAccount, postId: string, text: string): Promise<{ id: string }>;
  limits?: SocialLimits;
  /** Sem app OAuth (só token): esconde a opção "app da sua empresa". */
  tokenOnly?: boolean;
}

export class PlatformError extends Error {
  constructor(message: string, public expired = false) { super(message); }
}

/** fetch com timeout e erro legível. */
export async function http<T = Record<string, unknown>>(label: string, url: string, init?: RequestInit, expiredWhen?: (status: number, body: Record<string, unknown>) => boolean): Promise<T> {
  let res: Response;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }); }
  catch (e) { throw new PlatformError(`${label}: sem resposta (${e instanceof Error ? e.message : String(e)}).`); }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? (JSON.parse(text) as Record<string, unknown>) : {}; } catch { body = { raw: text.slice(0, 300) }; }
  const expired = expiredWhen?.(res.status, body) ?? res.status === 401;
  if (!res.ok || expired) {
    const msg = pickMessage(body) ?? `HTTP ${res.status}`;
    throw new PlatformError(expired ? `${label}: a autorização expirou ou foi revogada. Conecte de novo.` : `${label}: ${msg}`, expired);
  }
  return body as T;
}
function pickMessage(b: Record<string, unknown>): string | undefined {
  const e = b.error as Record<string, unknown> | string | undefined;
  if (typeof e === "string") return (b.error_description as string) ?? e;
  if (e && typeof e === "object") return (e.message as string) ?? JSON.stringify(e).slice(0, 300);
  if (Array.isArray(b.errors) && b.errors.length) { const x = b.errors[0] as Record<string, unknown>; return String(x.message ?? x.detail ?? JSON.stringify(x)).slice(0, 300); }
  return (b.message as string) ?? (b.description as string) ?? (b.detail as string) ?? (b.msg as string) ?? (b.error_message as string) ?? undefined;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

/** Baixa uma mídia (URL pública) com limite de tamanho, para redes que exigem enviar o arquivo. */
export async function download(label: string, url: string, maxBytes: number): Promise<{ bytes: Uint8Array; type: string; size: number; name: string }> {
  let res: Response;
  try { res = await fetch(url, { signal: AbortSignal.timeout(120_000) }); } catch (e) { throw new PlatformError(`${label}: não foi possível baixar a mídia (${e instanceof Error ? e.message : String(e)}).`); }
  if (!res.ok) throw new PlatformError(`${label}: a mídia não está acessível (HTTP ${res.status}). Use um link público.`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len && len > maxBytes) throw new PlatformError(`${label}: arquivo grande demais (${Math.round(len / 1e6)} MB; máximo ${Math.round(maxBytes / 1e6)} MB).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new PlatformError(`${label}: arquivo grande demais (${Math.round(bytes.byteLength / 1e6)} MB; máximo ${Math.round(maxBytes / 1e6)} MB).`);
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "arquivo").replace(/^\d+-/, "");
  return { bytes, type: res.headers.get("content-type")?.split(";")[0] || mimeOf(url), size: bytes.byteLength, name };
}
export const mimeOf = (url: string) => {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm" } as Record<string, string>)[ext] ?? "application/octet-stream";
};
export const isVideoUrl = (u: string) => /\.(mp4|mov|m4v|webm|avi)(\?|$)/i.test(u);
/** Conta caracteres como a pessoa vê (emoji = 1). */
export const graphemes = (s: string) => { try { return [...new Intl.Segmenter("pt", { granularity: "grapheme" }).segment(s)].length; } catch { return [...s].length; } };
export const blob = (bytes: Uint8Array, type: string) => new Blob([bytes as BlobPart], { type });
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Leitura tipada das opções. */
export const optStr = (o: NetOptions | undefined, k: string) => (typeof o?.[k] === "string" ? (o[k] as string) : "");
export const optBool = (o: NetOptions | undefined, k: string) => o?.[k] === true;
export const optList = (o: NetOptions | undefined, k: string) => (Array.isArray(o?.[k]) ? (o![k] as string[]) : []);
export const optNum = (o: NetOptions | undefined, k: string) => (typeof o?.[k] === "number" ? (o[k] as number) : undefined);
