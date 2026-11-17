// Vercel Function: /api/midia — envio de mídia por link (para agentes de IA).
import { handleMedia } from "../server/media.js";

const handle = (request: Request) => handleMedia(request, process.env);
export { handle as POST, handle as OPTIONS };
