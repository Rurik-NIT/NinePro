// Vercel Function: /api/meta-desautorizar — Deauthorize Callback da Meta (ver server/metaCallbacks.ts).
import { handleMetaDeauthorize } from "../server/metaCallbacks.js";

export async function POST(request: Request) {
  return handleMetaDeauthorize(request, process.env);
}
