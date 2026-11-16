// Vercel Function: POST /api/app — ações do app que precisam do servidor (ver server/app.ts).
import { handleApp } from "../server/app.js";

export async function POST(request: Request) {
  return handleApp(request, process.env);
}
