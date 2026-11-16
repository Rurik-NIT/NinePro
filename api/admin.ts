// Vercel Function: POST /api/admin — painel de super admin (ver server/admin.ts).
import { handleAdmin } from "../server/admin.js";

export async function POST(request: Request) {
  return handleAdmin(request, process.env);
}

export async function GET(request: Request) {
  return handleAdmin(request, process.env);
}
