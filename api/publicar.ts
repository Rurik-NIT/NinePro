// Vercel Function: /api/publicar — Vercel Cron que publica as publicações agendadas (ver server/channels.ts).
import { handlePublishDue } from "../server/channels.js";

const handle = (request: Request) => handlePublishDue(request, process.env);
export { handle as GET };
