// Повна браузерна верифікація сайту: обидва вьюпорти, навігація, консоль.
// Запуск: node scripts/verify-browser.mjs (потрібен `pnpm build`; сервер
// піднімає сам на :3198).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "shots", "verify");
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:3198";

const ROUTES = [
  "/",
  "/beta",
  "/about",
  "/hroshi",
  "/yizha",
  "/zvychky",
  "/trenuvannia",
  "/ruchna-robota",
  "/vyhid",
  "/guides",
  "/zvyazky",
  "/stan",
  "/obitsyanky",
  "/pytannya",
  "/guides/monobank",
  "/guides/kbzhv",
  "/guides/cheky",
  "/guides/foto-kalorii",
  "/guides/bank-bezpeka",
  "/guides/kilka-bankiv",
  "/data",
  "/privacy",
  "/terms",
  "/404",
  "/nope-404",
];

const server = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "vite", "preview", "--port", "3198", "--strictPort"],
  { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" },
);
await new Promise((r) => setTimeout(r, 2500));

const results = [];
const ok = (name, pass, extra = "") =>
  results.push(
    `${pass ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`,
  );

const browser = await chromium.launch();

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  return { ctx, page, errors };
}

async function noHScroll(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
}

// ---------- Прохід маршрутами в обох вьюпортах ----------
for (const [vw, tag] of [
  [{ width: 1280, height: 900 }, "desktop"],
  [{ width: 390, height: 844 }, "mobile"],
]) {
  const { ctx, page, errors } = await newPage(vw);
  for (const route of ROUTES) {
    errors.length = 0;
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    const name = route === "/" ? "home" : route.replaceAll("/", "_");
    await page.screenshot({
      path: path.join(OUT, `${tag}${name}.png`),
      fullPage: true,
    });
    ok(
      `${tag} ${route} без console/page errors`,
      errors.length === 0,
      errors.join("; ").slice(0, 160),
    );
    ok(`${tag} ${route} без горизонтального скролу`, await noHScroll(page));
    const title = await page.title();
    ok(`${tag} ${route} має title`, title.length > 5, title);
  }
  await ctx.close();
}

// ---------- Десктоп: наскрізна навігація кліками ----------
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  await page
    .getByLabel("Головна навігація")
    .getByRole("link", { name: "Гроші", exact: true })
    .click();
  await page.waitForURL("**/hroshi");
  ok("desktop нав Гроші → /hroshi", page.url().endsWith("/hroshi"));

  // Картка модуля на головній – теж точка входу, не декорація
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Харчування" }).first().click();
  await page.waitForURL("**/yizha");
  ok("картка модуля Харчування → /yizha", page.url().endsWith("/yizha"));

  await page.getByRole("link", { name: "Гайди" }).first().click();
  await page.waitForURL("**/guides");
  ok("desktop нав Гайди → /guides", page.url().endsWith("/guides"));

  await page
    .getByRole("link", { name: /Як підʼєднати Monobank/ })
    .first()
    .click();
  await page.waitForURL("**/guides/monobank");
  ok("desktop список гайдів → стаття", page.url().endsWith("/guides/monobank"));

  await page
    .getByLabel("Головна навігація")
    .getByRole("link", { name: "Звʼязки", exact: true })
    .click();
  await page.waitForURL("**/zvyazky");
  ok("desktop нав Звʼязки → /zvyazky", page.url().endsWith("/zvyazky"));

  await page
    .getByLabel("Футер")
    .getByRole("link", { name: "Про Sergeant" })
    .click();
  await page.waitForURL("**/about");
  ok("футер Про Sergeant → /about", page.url().endsWith("/about"));

  await page.getByRole("link", { name: "Стати в чергу" }).first().click();
  await page.waitForURL("**/beta");
  ok("desktop хедер-CTA → /beta", page.url().endsWith("/beta"));

  const statusLink = page
    .getByRole("link", { name: /Доповідь про стан/ })
    .first();
  await statusLink.click();
  await page.waitForURL("**/stan");
  ok("beta лінк «Що вже працює» → /stan", page.url().endsWith("/stan"));

  // TelegramCta: правильний деплінк з payload-ом
  await page.goto(BASE + "/beta", { waitUntil: "networkidle" });
  const href = await page
    .getByRole("link", { name: /Стати в чергу в Telegram/ })
    .getAttribute("href");
  ok(
    "beta TelegramCta несе placement beta_<ref>",
    /^https:\/\/t\.me\/.+\?start=beta_[a-z0-9]{16}$/.test(href ?? ""),
    href ?? "null",
  );

  // Мета: noindex лише на /beta; JSON-LD на ключових сторінках
  const robots = await page
    .locator('meta[name="robots"]')
    .getAttribute("content");
  ok("beta має robots=noindex", robots === "noindex", String(robots));
  for (const [route, type] of [
    ["/", "SoftwareApplication"],
    ["/pytannya", "FAQPage"],
    ["/obitsyanky", "ItemList"],
    ["/zvyazky", "Article"],
    ["/hroshi", "Article"],
    ["/yizha", "Article"],
    ["/zvychky", "Article"],
    ["/trenuvannia", "Article"],
    ["/ruchna-robota", "Article"],
    ["/vyhid", "Article"],
    ["/guides/kilka-bankiv", "Article"],
    ["/stan", "Article"],
    ["/about", "AboutPage"],
    ["/guides/monobank", "Article"],
    ["/guides", "ItemList"],
  ]) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    const kinds = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    ok(
      `${route} має JSON-LD ${type}`,
      kinds.some((k) => k.includes(type)),
    );
    const rb = await page.locator('meta[name="robots"]').count();
    if (route !== "/beta")
      ok(
        `${route} НЕ noindex`,
        rb === 0 ||
          (await page
            .locator('meta[name="robots"]')
            .getAttribute("content")) !== "noindex",
      );
  }
  await ctx.close();
}

// ---------- Мобільний: бургер-меню і таргети ----------
{
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  const burger = page.getByRole("button", { name: /меню/i });
  ok("mobile бургер видимий", await burger.isVisible());
  const bb = await burger.boundingBox();
  ok(
    "mobile бургер ≥44×44",
    !!bb && bb.width >= 44 && bb.height >= 44,
    bb ? `${Math.round(bb.width)}×${Math.round(bb.height)}` : "нема",
  );

  await burger.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "mobile-menu-open.png") });
  const menuGuides = page.getByRole("link", { name: "Гайди" }).last();
  ok("mobile меню відкрилось і має Гайди", await menuGuides.isVisible());
  const gb = await menuGuides.boundingBox();
  ok(
    "mobile пункт меню ≥44px заввишки",
    !!gb && gb.height >= 44,
    gb ? `${Math.round(gb.height)}px` : "нема",
  );

  await menuGuides.click();
  await page.waitForURL("**/guides");
  ok("mobile меню Гайди → /guides", page.url().endsWith("/guides"));

  // Бургер працює і на внутрішній сторінці
  await page.getByRole("button", { name: /меню/i }).click();
  await page.waitForTimeout(300);
  await page
    .getByLabel("Мобільна навігація")
    .getByRole("link", { name: "Про проєкт" })
    .click();
  await page.waitForURL("**/about");
  ok(
    "mobile меню Про проєкт → /about (з /guides)",
    page.url().endsWith("/about"),
  );

  await ctx.close();
}

await browser.close();
server.kill();

const fails = results.filter((r) => r.startsWith("FAIL"));
console.log(results.join("\n"));
console.log(
  `\n=== ПІДСУМОК: ${results.length - fails.length}/${results.length} PASS, ${fails.length} FAIL ===`,
);
process.exit(fails.length ? 1 : 0);
