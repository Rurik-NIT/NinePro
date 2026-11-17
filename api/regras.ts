// Vercel Function: /api/regras — Vercel Cron que executa as regras automáticas de anúncios (ver server/rules.ts).
import { handleRules } from "../server/rules.js";

const handle = (request: Request) => handleRules(request, process.env);
export { handle as GET };
