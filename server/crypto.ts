/**
 * Criptografia de tokens de plataforma (AES-256-GCM) e assinatura de "state" do OAuth (HMAC-SHA256).
 * Chave: TOKEN_ENCRYPTION_KEY (32 bytes em base64), só no servidor.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64url");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

function rawKey(env: Record<string, string | undefined>) {
  const k = env.TOKEN_ENCRYPTION_KEY;
  if (!k) throw new Error("Servidor sem TOKEN_ENCRYPTION_KEY configurada.");
  const bytes = new Uint8Array(Buffer.from(k, "base64"));
  if (bytes.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY precisa ter 32 bytes em base64.");
  return bytes;
}

export async function encryptToken(env: Record<string, string | undefined>, plain: string) {
  const key = await crypto.subtle.importKey("raw", rawKey(env), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decryptToken(env: Record<string, string | undefined>, packed: string) {
  const [v, iv, ct] = packed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Token em formato desconhecido.");
  const key = await crypto.subtle.importKey("raw", rawKey(env), "AES-GCM", false, ["decrypt"]);
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct)));
}

async function hmac(env: Record<string, string | undefined>, data: string) {
  const key = await crypto.subtle.importKey("raw", rawKey(env), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

/** state = payload.assinatura, válido por 15 minutos. */
export async function signState(env: Record<string, string | undefined>, payload: Record<string, unknown>) {
  const body = b64(enc.encode(JSON.stringify({ ...payload, exp: Date.now() + 15 * 60_000 })));
  return `${body}.${await hmac(env, body)}`;
}

export async function verifyState<T extends Record<string, unknown>>(env: Record<string, string | undefined>, state: string): Promise<T> {
  const [body, sig] = state.split(".");
  if (!body || !sig || (await hmac(env, body)) !== sig) throw new Error("Pedido de conexão inválido. Tente conectar de novo.");
  const data = JSON.parse(dec.decode(unb64(body))) as T & { exp: number };
  if (Date.now() > data.exp) throw new Error("O pedido de conexão expirou. Tente conectar de novo.");
  return data;
}
