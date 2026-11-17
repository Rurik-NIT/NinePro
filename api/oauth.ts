// Vercel Function: /api/oauth — OAuth 2.1 para agentes de IA (metadados, registro, token, revogação).
import { handleOauth } from "../server/oauth.js";

const handle = (request: Request) => handleOauth(request, process.env);
export { handle as GET, handle as POST, handle as OPTIONS };
