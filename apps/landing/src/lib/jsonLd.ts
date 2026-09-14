/**
 * Абсолютизація URL у JSON-LD.
 *
 * Сторінки пишуть `url`, `logo` і `image` відносними шляхами: сам React не
 * знає публічного домену – його знає лише білд (`scripts/site-url.mjs`).
 * Відносний URL у schema.org формально припустимий, але краулер, який не
 * виконує JS, читає розмітку без базового документа, тож у статичний HTML
 * вони мають потрапити абсолютними.
 *
 * Обидва шляхи рендера користуються цією функцією: SSG – через
 * `entry-server.tsx` з адресом білда, браузер – через `usePageMeta` з
 * `window.location.origin`.
 */
const URL_KEYS = new Set(["url", "logo", "image", "contentUrl"]);

export function absolutizeJsonLd(value: unknown, origin: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => absolutizeJsonLd(item, origin));
  }
  if (value === null || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] =
      URL_KEYS.has(key) && typeof val === "string" && val.startsWith("/")
        ? `${origin.replace(/\/$/, "")}${val}`
        : absolutizeJsonLd(val, origin);
  }
  return out;
}
