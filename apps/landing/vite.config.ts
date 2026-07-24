import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Маркетинговий лендінг Sergeant (sergeant.com.ua).
// Окремий static-білд; API-запити (вейтліст) проксіюються на сервер —
// так само, як в apps/web.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = (
    env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000"
  ).replace(/\/$/, "");

  return {
    plugins: [react(), tailwindcss()],
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
