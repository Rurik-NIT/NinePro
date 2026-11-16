// Vercel Function: /api/meta-exclusao — Data Deletion Request Callback da Meta (ver server/metaCallbacks.ts).
import { handleMetaDeletion } from "../server/metaCallbacks.js";

const handle = (request: Request) => handleMetaDeletion(request, process.env);
export { handle as GET, handle as POST };
