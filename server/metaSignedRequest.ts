/** Validação do signed_request enviado pela Meta nos callbacks de exclusão e desautorização. */
const b64urlToBytes = (s: string) => new Uint8Array(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));

/** Valida o signed_request da Meta (HMAC-SHA256 com a chave secreta do app). */
export async function parseSignedRequest(signed: string, appSecret: string): Promise<{ user_id: string; algorithm: string; issued_at?: number }> {
  const [sigPart, payloadPart] = signed.split(".");
  if (!sigPart || !payloadPart) throw new Error("signed_request malformado.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sigPart), new TextEncoder().encode(payloadPart));
  if (!ok) throw new Error("Assinatura inválida.");
  const payload = JSON.parse(Buffer.from(b64urlToBytes(payloadPart)).toString("utf8")) as { user_id: string; algorithm: string; issued_at?: number };
  if (String(payload.algorithm).toUpperCase() !== "HMAC-SHA256" || !payload.user_id) throw new Error("signed_request inesperado.");
  return payload;
}
