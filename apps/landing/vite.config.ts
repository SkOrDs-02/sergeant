import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Абсолютні URL у head. `og:image`, `og:url` і `canonical` мають бути
 * абсолютними — Telegram, X і Facebook не резолвлять відносний `og:image`, і
 * прев'ю виходить порожнім. Але публічного домену ще немає, тож замість
 * хардкоду беремо його з оточення:
 *
 *   `SITE_URL` — явне значення (власний домен, коли зʼявиться);
 *   `VERCEL_PROJECT_PRODUCTION_URL` — Vercel підставляє сам (голий хост).
 *
 * Якщо жодного немає (dev, локальний білд) — теги просто не додаються.
 * Це навмисно: помилковий `canonical` шкідливіший за його відсутність, бо
 * прямо каже краулеру індексувати інший URL.
 */
function absoluteUrlMeta(siteUrl: string | undefined): Plugin {
  return {
    name: "sergeant-absolute-url-meta",
    transformIndexHtml(html) {
      if (!siteUrl) return html;
      const tags = [
        `<link rel="canonical" href="${siteUrl}/" />`,
        `<meta property="og:url" content="${siteUrl}/" />`,
        `<meta property="og:image" content="${siteUrl}/og.png" />`,
        `<meta name="twitter:image" content="${siteUrl}/og.png" />`,
      ].join("\n    ");
      return html.replace("</head>", `  ${tags}\n  </head>`);
    },
  };
}

function resolveSiteUrl(env: Record<string, string>): string | undefined {
  const explicit = env["SITE_URL"]?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercelHost = env["VERCEL_PROJECT_PRODUCTION_URL"]?.trim();
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, "")}`;
  return undefined;
}

// Маркетинговий лендінг Sergeant. Окремий static-білд на Vercel; запити
// `/api/*` у проді проксіює edge-middleware (`middleware.ts`) на `BACKEND_URL`,
// у dev — проксі нижче. Обидва шляхи роблять API same-origin, тому клієнт
// усюди ходить відносним шляхом і CORS не задіяний.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = (
    env["VITE_API_PROXY_TARGET"] || "http://127.0.0.1:3000"
  ).replace(/\/$/, "");

  return {
    plugins: [react(), tailwindcss(), absoluteUrlMeta(resolveSiteUrl(env))],
    resolve: {
      // Монорепо лінкується hoisted (`node-linker=hoisted`), тож react живе
      // в кореневому node_modules і збігається з версією apps/web. `dedupe`
      // тримає один інстанс, якщо транзитивна залежність притягне копію.
      dedupe: ["react", "react-dom", "react-router-dom"],
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
