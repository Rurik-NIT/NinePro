import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
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
});
