// Vercel Function: /api/canais-webhook — webhooks da Meta (WhatsApp e Instagram). Ver server/channels.ts.
import { handleChannelWebhook } from "../server/channels.js";

const handle = (request: Request) => handleChannelWebhook(request, process.env);
export { handle as GET, handle as POST };
