// Vercel Function: /api/sync — sincronização diária (Vercel Cron) das contas de anúncio conectadas.
import { handleSync } from "../server/connections.js";

export async function GET(request: Request) {
  return handleSync(request, process.env);
}
