// Vercel Function: /api/canais — ações de WhatsApp e Instagram vindas das telas (ver server/channels.ts).
import { handleChannels } from "../server/channels.js";

const handle = (request: Request) => handleChannels(request, process.env);
export { handle as POST };
