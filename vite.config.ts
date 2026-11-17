import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import type { IncomingMessage } from "node:http";

/** Em desenvolvimento, atende /api/* com o mesmo código das Vercel Functions. */
const API_ROUTES: { prefix: string; module: string; fn: string }[] = [
  { prefix: "/api/admin", module: "/server/admin.ts", fn: "handleAdmin" },
  { prefix: "/api/app", module: "/server/app.ts", fn: "handleApp" },
  { prefix: "/api/connect", module: "/server/connections.ts", fn: "handleConnect" },
  { prefix: "/api/sync", module: "/server/connections.ts", fn: "handleSync" },
  { prefix: "/api/meta-exclusao", module: "/server/metaCallbacks.ts", fn: "handleMetaDeletion" },
  { prefix: "/api/meta-desautorizar", module: "/server/metaCallbacks.ts", fn: "handleMetaDeauthorize" },
  { prefix: "/api/canais-webhook", module: "/server/channels.ts", fn: "handleChannelWebhook" },
  { prefix: "/api/canais", module: "/server/channels.ts", fn: "handleChannels" },
  { prefix: "/api/publicar", module: "/server/channels.ts", fn: "handlePublishDue" },
  { prefix: "/api/eventos", module: "/server/ingest.ts", fn: "handleIngest" },
  { prefix: "/api/regras", module: "/server/rules.ts", fn: "handleRules" },
  { prefix: "/api/mcp", module: "/server/agentApi.ts", fn: "handleMcp" },
  { prefix: "/api/oauth", module: "/server/oauth.ts", fn: "handleOauth" },
  { prefix: "/api/midia", module: "/server/media.ts", fn: "handleMedia" },
  { prefix: "/.well-known/oauth-protected-resource", module: "/server/oauth.ts", fn: "handleOauth" },
  { prefix: "/.well-known/oauth-authorization-server", module: "/server/oauth.ts", fn: "handleOauth" },
  { prefix: "/.well-known/openid-configuration", module: "/server/oauth.ts", fn: "handleOauth" },
  { prefix: "/api/v1", module: "/server/agentApi.ts", fn: "handleRest" },
];
function apiDev(env: Record<string, string>): Plugin {
  return {
    name: "ninepro-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res, next) => {
        const url = req.url ?? "";
        const route = API_ROUTES.find((r) => url === r.prefix || url.startsWith(r.prefix + "/") || url.startsWith(r.prefix + "?"));
        if (!route) return next();
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const hasBody = !["GET", "HEAD", "OPTIONS"].includes(req.method ?? "GET");
          const request = new Request(`http://${req.headers.host ?? "localhost"}${url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
          const mod = (await server.ssrLoadModule(route.module)) as Record<string, (r: Request, e: Record<string, string | undefined>) => Promise<Response>>;
          const response = await mod[route.fn](request, { ...env, ...process.env });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), apiDev(env)],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: { port: 5179, strictPort: true },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            const i = id.lastIndexOf("node_modules/");
            if (i === -1) return;
            const pkg = id.slice(i + 13);
            if (/^(recharts|d3-|victory-vendor|internmap|decimal\.js-light)/.test(pkg)) return "vendor-charts";
            if (/^(@radix-ui|cmdk)/.test(pkg)) return "vendor-ui";
            if (/^(date-fns|react-day-picker|@date-fns)/.test(pkg)) return "vendor-date";
            if (/^(react|react-dom|react-router|react-router-dom|scheduler|@remix-run)\//.test(pkg)) return "vendor-react";
          },
        },
      },
    },
  };
});
