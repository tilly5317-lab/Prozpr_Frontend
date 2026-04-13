import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const root = __dirname;
  const env = loadEnv(mode, root, "");

  /** Dev-server proxy only; not exposed to the browser. Default local FastAPI. */
  const apiDevProxy = (env.API_DEV_PROXY || "http://localhost:8000").trim();

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api/v1": {
          target: apiDevProxy,
          changeOrigin: true,
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(root, "./src"),
      },
    },
  };
});
