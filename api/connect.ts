// Vercel Function: /api/connect — OAuth e ações das conexões com plataformas (ver server/connections.ts).
import { handleConnect } from "../server/connections.js";

const handle = (request: Request) => handleConnect(request, process.env);
export { handle as GET, handle as POST };
