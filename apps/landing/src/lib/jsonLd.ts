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
// відносними, а Google для них вимагає абсолютні адреси. `@id` і
// `mainEntityOfPage` пишуться відносними з `enrichJsonLd` нижче.
const URL_KEYS = new Set([
  "url",
  "logo",
  "image",
  "contentUrl",
  "item",
  "mainEntityOfPage",
  "@id",
]);

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

/** Вузол організації, на який посилаються всі сторінки сайту. */
export const ORGANIZATION_ID = "/#organization";

const ORGANIZATION_BASE = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "Sergeant",
  url: "/",
  logo: "/apple-touch-icon.png",
};

const ARTICLE_TYPES = new Set(["Article", "HowTo"]);

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function enrichNode(node: Node, route: string): Node {
  const out: Node = { ...node };
  const meta = (ROUTE_META as Record<string, { ogImage?: string } | undefined>)[
    route
  ];

  // Одна організація з `@id` замість безіменних копій на кожній сторінці:
  // за ним пошуковик склеює видавця всіх сторінок з вузлом головної.
  if (isNode(out.publisher) && out.publisher["@type"] === "Organization") {
    out.publisher = { ...ORGANIZATION_BASE, ...out.publisher };
  }
  // Автор веде на сторінку «Про проєкт», де названо, хто він.
  if (isNode(out.author) && out.author["@type"] === "Person") {
    out.author = { url: "/about", ...out.author };
  }
  // Поля, які Google рекомендує для Article: адреса сторінки і картинка.
  // Картинка – та сама og-картинка маршруту, що й у превʼю посилань.
  if (typeof out["@type"] === "string" && ARTICLE_TYPES.has(out["@type"])) {
    out.url ??= route;
    out.mainEntityOfPage ??= route;
    out.image ??= meta?.ogImage ?? "/og.png";
  }
  return out;
}

/**
 * Спільні поля сторінкової розмітки, дописані централізовано.
 *
 * Навіщо: до 2026-10-08 кожна з двадцяти чотирьох сторінок писала видавця
 * як `{ "@type": "Organization", name: "Sergeant" }` без `@id`, а статті не
 * мали ні адреси, ні картинки (аудит сайту 2026-10-08, S8–S9). Правити це в
 * кожному файлі означало б, що наступна сторінка знову забуде, тож поля
 * додаються тут, в обох шляхах рендера, поруч із `withBreadcrumb`. Значення,
 * які сторінка задала сама, не перезаписуються.
 */
export function enrichJsonLd(
  jsonLd: object | undefined,
  pathname: string,
): object | undefined {
  if (!jsonLd) return jsonLd;
  const route = pathname.replace(/\/$/, "") || "/";
  const root = jsonLd as Node;
  if (Array.isArray(root["@graph"])) {
    return {
      ...root,
      "@graph": root["@graph"].map((n: unknown) =>
        isNode(n) ? enrichNode(n, route) : n,
      ),
    };
  }
  return enrichNode(root, route);
}
