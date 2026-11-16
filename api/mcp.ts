// Vercel Function: /api/mcp — servidor MCP (Streamable HTTP, sem estado) do NinePro.
import { handleMcp } from "../server/agentApi.js";

const handle = (request: Request) => handleMcp(request, process.env);
export { handle as GET, handle as POST, handle as OPTIONS };
