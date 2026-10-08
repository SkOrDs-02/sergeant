import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROUTE_META } from "./pageMeta";

/**
 * Гейт машинної поверхні сайту: те, що читають агенти, а не люди.
 *
 * Зовнішня перевірка (is-agentic, прогін 2026-09-21) знайшла три речі, які
 * ламаються тихо: markdown-переговори не вмикаються без правил у
 * `vercel.json`, llms.txt без секції «коли кликати» читається як маркетинг,
 * а `contactPoint` зникає з розмітки при першому ж рефакторі HomePage.
 * Жодну з них не видно ні в типах, ні в білді, тож тримає тест.
 */
const LANDING = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function read(rel: string): string {
  return readFileSync(path.join(LANDING, rel), "utf8");
}

describe("markdown-переговори", () => {
  const mw = read("middleware.ts");
  const cfg = JSON.parse(read("vercel.json")) as {
    rewrites?: unknown[];
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };

  it("живуть у middleware, а не в rewrites", () => {
    // Знахідка проду 2026-09-21: Vercel перевіряє файлову систему ДО
    // rewrites, тож правило з умовою Accept на `/` не виконувалось ніколи –
    // запит знаходив готовий index.html. Middleware працює перед нею.
    expect(mw).toContain("@vercel/edge");
    expect(mw).toMatch(/text\/markdown/);
    expect(mw).toContain("rewrite(");
    expect(cfg.rewrites, "мертві rewrites повернулись").toBeUndefined();
  });

  it("веде на .md того самого маршруту", () => {
    expect(mw).toMatch(/index\.md/);
  });

  it("не чіпає файли з розширенням і ассети", () => {
    // /llms.txt, /sitemap.xml і /assets/*.js мусять лишатись собою навіть
    // для агента, що просить markdown: інакше карта сайту стає 404.
    const matcher = mw.match(/matcher:\s*\[([^\]]+)\]/)?.[1] ?? "";
    expect(matcher).toContain("assets/");
    // Саме екранована крапка. Неекранована – це «будь-який символ», і
    // виключення файлів мовчки перестає працювати (спіймано лінтом
    // 2026-09-21, тест тоді лишався зеленим).
    expect(matcher).toContain(String.raw`.*\\.`);
  });

  it("невідомий шлях дає 404 з markdown-тілом, а не HTML", () => {
    // Essential-пункт скорера: статус мусить лишитись справжнім 404, а
    // тіло – поясненням із покажчиками. Переписування в неіснуючий .md
    // дало б HTML-сторінку 404, тобто розмітку замість тексту.
    expect(mw).toContain("routeMeta.json");
    expect(mw).toMatch(/status:\s*404/);
    expect(mw).toMatch(/text\/markdown; charset=utf-8/);
    expect(mw).toMatch(/sitemap\.xml[\s\S]{0,200}llms\.txt/);
  });

  it("HTML лишається дефолтом", () => {
    // Без цієї перевірки легко зробити middleware, що переписує все підряд.
    expect(mw).toMatch(/if \(!accept[\s\S]{0,80}return next\(\)/);
  });

  it("віддає Vary: Accept, інакше кеш отруїть відповідь", () => {
    const vary = cfg.headers.find((h) =>
      h.headers.some((x) => x.key === "Vary" && x.value === "Accept"),
    );
    expect(vary, "немає правила з Vary: Accept").toBeDefined();
  });
});

describe("одна адреса на сторінку", () => {
  // Аудит сайту 2026-10-08 (S1, S2, S14): www, шлях зі слешем і markdown-копії
  // віддавали 200 поруч з основною адресою, і дублі тримав лише canonical.
  const cfg = JSON.parse(read("vercel.json")) as {
    trailingSlash?: boolean;
    redirects: {
      source: string;
      destination: string;
      permanent?: boolean;
      has?: { type: string; value: string }[];
    }[];
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };

  it("www веде на основний домен постійним редиректом", () => {
    const www = cfg.redirects.find((r) =>
      r.has?.some((h) => h.type === "host" && h.value.startsWith("www.")),
    );
    expect(www, "немає редиректу з www").toBeDefined();
    expect(www?.destination).toBe("https://sergeant.com.ua/:path*");
    expect(www?.permanent).toBe(true);
  });

  it("шлях зі слешем у кінці редиректиться на шлях без нього", () => {
    // Збігається з canonical і sitemap, які пишуть адреси без слеша.
    expect(cfg.trailingSlash).toBe(false);
  });

  it("markdown-копії і llms-full.txt не потрапляють у пошуковий індекс", () => {
    const noindexed = cfg.headers
      .filter((h) =>
        h.headers.some(
          (x) => x.key === "X-Robots-Tag" && x.value === "noindex",
        ),
      )
      .map((h) => h.source);
    expect(noindexed).toContain(String.raw`/(.*)\.md`);
    expect(noindexed).toContain("/llms-full.txt");
  });
});

describe("крихти гайдів", () => {
  it("додаються централізовано, не в кожному гайді руками", () => {
    // Доданий маршрут інакше тихо лишається без крихт, і помітить це вже
    // видача. Обидва шляхи рендера кличуть один хелпер.
    expect(read("src/lib/jsonLd.ts")).toContain("withBreadcrumb");
    expect(read("src/entry-server.tsx")).toContain("withBreadcrumb");
    expect(read("src/lib/pageMeta.ts")).toContain("withBreadcrumb");
  });

  it("адреси кроків абсолютні", () => {
    // Google вимагає для BreadcrumbList абсолютні адреси; ключ `item` мусить
    // бути в наборі, який абсолютизує розмітку.
    const src = read("src/lib/jsonLd.ts");
    const keys = src.match(/const URL_KEYS[^;]+;/)?.[0] ?? "";
    expect(keys).toContain('"item"');
  });
});

describe("llms.txt як інструкція для агента", () => {
  const llms = read("public/llms.txt");

  it("має секцію «коли кликати» з англомовним маркером", () => {
    expect(llms).toMatch(/коли кликати/i);
    expect(llms.toLowerCase()).toContain("when to use this");
  });

  it("називає і придатні задачі, і межу застосування", () => {
    expect(llms).toMatch(/НЕ підходить/);
    // Порожня обіцянка без конкретики – те саме, що її відсутність.
    const section = llms.slice(llms.indexOf("## Коли кликати"));
    expect(section.length).toBeGreaterThan(600);
  });

  it("веде агента на сторінку звʼязку", () => {
    expect(llms).toContain("https://sergeant.com.ua/contact");
  });
});

describe("сторінка звʼязку", () => {
  it("зареєстрована в меті з власним lastmod", () => {
    expect(ROUTE_META).toHaveProperty("/contact");
  });

  it("несе обидва публічні канали і не вигадує реквізитів", () => {
    const page = read("src/pages/ContactPage.tsx");
    expect(page).toContain("TELEGRAM_BOT_URL");
    expect(page).toContain("THREADS_URL");
    // Ані пошти, ані телефону в продукту публічно немає; поява тут будь-якого
    // з них означає вигадані реквізити в розмітці, яку читають перевіряючи.
    expect(page).not.toMatch(/mailto:|tel:/);
  });

  it("contactPoint головної вказує на бота, а не на токен сесії", () => {
    const home = read("src/pages/HomePage.tsx");
    expect(home).toContain("contactPoint");
    expect(home).toContain("TELEGRAM_BOT_URL");
    expect(home).not.toMatch(/contactPoint[\s\S]{0,400}telegramStartLink/);
  });
});
