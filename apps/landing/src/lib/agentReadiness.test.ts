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

describe("markdown-переговори у vercel.json", () => {
  const cfg = JSON.parse(read("vercel.json")) as {
    rewrites?: {
      source: string;
      has?: { key: string; value: string }[];
      destination: string;
    }[];
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };

  it("кожне правило переписування спрацьовує лише на Accept: text/markdown", () => {
    expect(cfg.rewrites?.length).toBeGreaterThan(0);
    for (const rule of cfg.rewrites ?? []) {
      const accept = rule.has?.find((h) => h.key === "accept");
      expect(accept, `правило ${rule.source} без умови accept`).toBeDefined();
      expect(accept?.value).toContain("text/markdown");
      expect(rule.destination).toMatch(/\.md$/);
    }
  });

  it("покриває головну, один і два сегменти шляху", () => {
    const sources = (cfg.rewrites ?? []).map((r) => r.source);
    expect(sources).toContain("/");
    // Два сегменти потрібні гайдам: /guides/monobank.
    expect(sources.some((s) => s.split("/").length === 3)).toBe(true);
  });

  it("не підміняє файли з розширенням і ассети", () => {
    // /llms.txt, /sitemap.xml і /assets/*.js мусять лишатись собою навіть
    // для агента, що просить markdown: інакше карта сайту стає 404.
    for (const rule of cfg.rewrites ?? []) {
      if (rule.source === "/") continue;
      expect(rule.source).toContain("[^./]+");
    }
  });

  it("віддає Vary: Accept, інакше кеш отруїть відповідь", () => {
    const vary = cfg.headers.find((h) =>
      h.headers.some((x) => x.key === "Vary" && x.value === "Accept"),
    );
    expect(vary, "немає правила з Vary: Accept").toBeDefined();
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
