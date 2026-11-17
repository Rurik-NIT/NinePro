/**
 * Contrato comum das plataformas de anúncio. Cada plataforma traduz a própria API para estes
 * formatos; o restante do NinePro (sincronização, telas, agentes) não conhece detalhes de API.
 */
export type Env = Record<string, string | undefined>;
export type PlatformId = "meta" | "google" | "tiktok" | "linkedin";
export type ChannelId = "whatsapp" | "instagram";
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
  exchangeCode(env: Env, app: AppCreds, code: string, redirectUri: string): Promise<ExchangeResult>;
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
}

/** Número de WhatsApp ou conta do Instagram encontrada na conexão. */
export interface NChannelAccount { externalId: string; parentExternalId?: string | null; name: string; displayName?: string | null; picture?: string | null; status: string; quality?: string | null; detail?: Record<string, unknown> }

/** Canal de mensagens / rede social. */
export interface ChannelProvider extends Connector {
  id: ChannelId;
  discover(env: Env, auth: StoredAuth): Promise<NChannelAccount[]>;
  /** Inscreve o app nos webhooks da conta (mensagens, comentários). Devolve aviso legível quando falha. */
  subscribe(env: Env, auth: StoredAuth, accounts: NChannelAccount[]): Promise<string | null>;
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
  return (b.message as string) ?? (b.msg as string) ?? undefined;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
