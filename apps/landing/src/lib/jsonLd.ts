import ROUTE_META from "./routeMeta.json";

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
// `item` – адреса кроку в `BreadcrumbList`; без нього крихти лишались
// відносними, а Google для них вимагає абсолютні адреси.
const URL_KEYS = new Set(["url", "logo", "image", "contentUrl", "item"]);

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

/**
 * Хлібні крихти для гайда, доклеєні до розмітки сторінки.
 *
 * Навіщо: `BreadcrumbList` – один із небагатьох типів, для яких Google досі
 * малює розширений результат, і у видачі замість голого URL зʼявляється шлях
 * «sergeant.com.ua › Гайди › <назва>». Це працює на клікабельність, тобто на
 * людину, а не лише на машину.
 *
 * Чому централізовано, а не в кожному гайді: доданий маршрут інакше тихо
 * лишиться без крихт, і помітить це вже видача. Обидва шляхи рендера
 * (SSG і клієнтська навігація) кличуть цю функцію в одному місці кожен.
 */
export function withBreadcrumb(
  jsonLd: object | undefined,
  pathname: string,
): object | undefined {
  if (!jsonLd) return jsonLd;
  const route = pathname.replace(/\/$/, "");
  if (!route.startsWith("/guides/")) return jsonLd;

  const meta = (ROUTE_META as Record<string, { title?: string } | undefined>)[
    route
  ];
  if (!meta?.title) return jsonLd;

  const { "@context": context, ...node } = jsonLd as Record<string, unknown>;
  return {
    "@context": context ?? "https://schema.org",
    "@graph": [
      node,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Головна", item: "/" },
          { "@type": "ListItem", position: 2, name: "Гайди", item: "/guides" },
          {
            "@type": "ListItem",
            position: 3,
            name: meta.title,
            item: route,
          },
        ],
      },
    ],
  };
}
