import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import type { IncomingMessage } from "node:http";

/** Em desenvolvimento, atende POST /api/admin com o mesmo código da Vercel Function. */
function adminApiDev(env: Record<string, string>): Plugin {
  return {
    name: "ninepro-admin-api-dev",
    configureServer(server) {
      server.middlewares.use("/api/admin", async (req: IncomingMessage, res, next) => {
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const request = new Request(`http://localhost${req.url ?? ""}`, { method: req.method, headers, body: req.method === "GET" ? undefined : Buffer.concat(chunks) });
          const { handleAdmin } = (await server.ssrLoadModule("/server/admin.ts")) as typeof import("./server/admin");
          const response = await handleAdmin(request, { ...env, ...process.env });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await response.text());
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
    plugins: [react(), adminApiDev(env)],
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
