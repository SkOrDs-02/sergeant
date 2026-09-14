// Єдине джерело публічного адреса сайту для всього білда: postbuild-seo
// (canonical, og:url, sitemap), prerender (абсолютні URL у JSON-LD) і
// vite.config (absoluteUrlMeta у базовому index.html). До 2026-09 логіка
// стояла двічі й розходилась: vite.config без env не додавав тегів узагалі,
// postbuild-seo мав власний дефолт. Розбіжність тиха — обидві гілки зелені.
const DEFAULT_SITE = "https://sergeant.com.ua";

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string} адрес без кінцевого слеша
 */
export function resolveSiteUrl(env = process.env) {
  const explicit = env["SITE_URL"]?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercelHost = env["VERCEL_PROJECT_PRODUCTION_URL"]?.trim();
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, "")}`;
  return DEFAULT_SITE;
}
