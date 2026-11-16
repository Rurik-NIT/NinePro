// Vercel Function: /api/v1/* — API REST para agentes (ver server/agentApi.ts).
// O vercel.json reescreve /api/v1/<caminho> para /api/v1?__path=<caminho>.
import { handleRest } from "../server/agentApi.js";

const handle = (request: Request) => handleRest(request, process.env);
export { handle as GET, handle as POST, handle as PATCH, handle as OPTIONS };
