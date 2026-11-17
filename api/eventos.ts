// Vercel Function: /api/eventos — tag do site (visitas e conversões). Ver server/ingest.ts.
import { handleIngest } from "../server/ingest.js";

const handle = (request: Request) => handleIngest(request, process.env);
export { handle as POST, handle as OPTIONS };
