import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Маркетинговий лендінг Sergeant (sergeant.com.ua).
// Окремий static-білд; API-запити (вейтліст) проксіюються на сервер —
// так само, як в apps/web.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = (
    env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3001"
  ).replace(/\/$/, "");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      // У монорепо є react@18 (apps/web) і react@19 (landing).
      // Прив'язуємо всі імпорти react до локальної копії, щоб уникнути
      // "Invalid hook call" через дві копії React.
      dedupe: ["react", "react-dom", "react-router-dom"],
      alias: {
        react: path.resolve(dirname, "node_modules/react"),
        "react-dom": path.resolve(dirname, "node_modules/react-dom"),
      },
    },
    server: {
      host: true,
      port: 3100,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
