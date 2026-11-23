import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { getWorld } from "../fixtures/worlds";
import { installWorld } from "../utils/scenario";
import { seedFTUX } from "../utils/seedFTUX";
import { settleAnimations } from "../utils/settleAnimations";

/**
 * Закриває три рядки «не перевірено» зі спеки
 * `docs/work/specs/accessibility-low-vision-beta.md`:
 *
 *   1. HC-тема через axe на маршрутах поза тематичною підмножиною
 *      `axe.spec.ts` (там лише 5 поверхонь) — її AAA-токени перевіряли
 *      вручну при написанні й автоматикою не стерегли;
 *   2. масштабування тексту (iOS «Larger Text» / Android «Text scaling»)
 *      було неперевіреним — тут апроксимується масштабом кореневого
 *      шрифту, на який реагують rem-утиліти `.text-style-*`;
 *   3. reflow перевіряли лише на початковому рендері, ніколи — з
 *      відкритим оверлеєм.
 *
 * Трюк із кореневим шрифтом — АПРОКСИМАЦІЯ, а не заміна реального
 * пристрою: він рухає лише rem-типографіку, тож ~800 сирих px-утиліт
 * лишаються на місці. Але він ловить саме той клас дефектів, про який
 * спека: текст росте всередині контейнера, що не може рости разом із ним.
 * Горизонтальну обрізку (три крапки) тут не міряємо — її вже стереже
 * `tests/mobile/nav-label-fit.spec.ts`; тут — вертикальна: зрізані виносні
 * елементи, текст, що вилазить за фіксовану висоту.
 */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

const ROUTES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "hub-root", path: "/" },
  { name: "finyk", path: "/finyk" },
  { name: "nutrition-menu", path: "/nutrition/menu" },
  { name: "routine-stats", path: "/routine/stats" },
  { name: "settings", path: "/settings" },
];

async function bootstrap(
  page: Page,
  path: string,
  extra: Record<string, string> = {},
) {
  await seedFTUX(page, "post-ftux", {
    extra: { finyk_manual_only_v1: "1", ...extra },
  });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
    /* allow-through: some surfaces keep long-polling connections open */
  });
  await page
    .locator("main, [role='main'], [data-a11y-root], #root > *")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

/** Два кадри поспіль: reflow після зміни розміру шрифту вже відбувся. */
async function nextFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/**
 * Дочекатись, поки підпис активного табу нижньої навігації розгорнеться.
 *
 * Підпис неактивних табів згорнутий у `max-w-0 opacity-0` і лише в
 * активного розгортається (`transition-[max-width,opacity]`) — причому не
 * миттєво після маунту, а коли застосунок виставить активний таб. Замір,
 * що потрапив ДО цього, бачить або порожній DOM, або підпис шириною 0 і
 * пропускає його як «схований» — тобто той самий дефект то ловиться, то ні,
 * залежно від швидкості машини (виміряно: 1 з 8 прогонів на hub-root).
 * Тому міряємо лише після того, як розгорнутий підпис справді зʼявився.
 *
 * Нав-бар є на кожному маршруті з `ROUTES`; якщо колись зникне, це має
 * впасти тут із зрозумілим повідомленням, а не мовчки пропустити перевірку.
 */
async function waitForNavLabelsExpanded(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Array.from(
            document.querySelectorAll<HTMLElement>("[data-nav-label]"),
          ).some(
            (el) => getComputedStyle(el).opacity === "1" && el.clientWidth > 1,
          ),
        ),
      { message: "the active nav label never expanded" },
    )
    .toBe(true);
}

/**
 * Елементи, текст яких зрізає контейнер, що не може вирости.
 *
 * Підписи нав-бару (`[data-nav-label]`) міряються тут БЕЗ винятків: трек
 * нав-бару має мінімальну (`min-h-[60px]`), а не фіксовану висоту, тож
 * активний підпис росте разом із кореневим текстом. Колись для них стояв
 * вузький виняток `TODO(low-vision-nav-label-clip)` — дефект виправлено і
 * виняток знято; не повертай його, а лагодь висоту нав-бару.
 */
async function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const clipped: string[] = [];
    for (const el of Array.from(
      document.body.querySelectorAll<HTMLElement>("*"),
    )) {
      if (!el.textContent?.trim()) continue;
      if (el.children.length > 0) continue; // лише листові текстові вузли
      const style = getComputedStyle(el);
      if (style.overflowY !== "hidden" && style.overflow !== "hidden") continue;
      // Сховане навмисно: згорнуті підписи неактивних табів (`max-w-0
      // opacity-0`) обрізані за задумом, людина їх не бачить.
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      ) {
        continue;
      }
      // Screen-reader-only текст: `sr-only` стискає бокс до 1px і обрізає
      // навмисно, тож «текст вищий за бокс» там — задуманий стан, а не
      // дефект. Розпізнаємо його ПО ОЗНАКАХ (`clip`/`clip-path` або
      // absolute-бокс 1×1), а не за «висота ≤ 1px»: перша версія цього
      // детектора пропускала так усе, що менше за піксель, — і разом із
      // sr-only мовчки пропускала підписи, яких флекс зтиснув до 0px, тобто
      // рівно той дефект, заради якого тест існує.
      if (style.clipPath.startsWith("inset(50%")) continue;
      if (style.clip === "rect(0px, 0px, 0px, 0px)") continue;
      if (
        style.position === "absolute" &&
        el.clientWidth <= 1 &&
        el.clientHeight <= 1
      ) {
        continue;
      }
      // `line-clamp` ріже текст навмисно (і малює три крапки) — це дизайн, а
      // не дефект.
      const clamp = style.getPropertyValue("-webkit-line-clamp");
      if (clamp !== "" && clamp !== "none") continue;
      // Em-бокс шрифту (повні ascent + descent) вищий за будь-що, що
      // малюють реальні гліфи, тож кілька відсотків «переповнення» —
      // нормальні метрики, а не зрізаний текст. 10% — комфортно нижче
      // дефекту `leading-none` (line-height 1 переповнює ~17%) і вище цього
      // шуму.
      if (el.scrollHeight > el.clientHeight * 1.1) {
        const cls = typeof el.className === "string" ? el.className.trim() : "";
        clipped.push(
          `<${el.tagName.toLowerCase()}${cls ? "." + cls.split(/\s+/).slice(0, 4).join(".") : ""}> ` +
            `"${el.textContent.trim().slice(0, 40)}" ` +
            `(${el.scrollHeight}px of text in ${el.clientHeight}px)`,
        );
      }
      if (clipped.length >= 5) break;
    }
    return clipped;
  });
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
}

// ── 1. HC-тема через axe ────────────────────────────────────────────────
for (const { name, path } of ROUTES) {
  test(`a11y-hc: ${name} has no serious/critical violations in the high-contrast theme`, async ({
    page,
  }) => {
    // `hub_theme_v2` — власний ключ персистенції застосунку: сідінг через
    // нього — той самий шлях, яким іде користувач через перемикач теми, тож
    // жодного тестового хука. Клас `hc` ще й ставимо до гідрації (як
    // `axe.spec.ts`), щоб скан міряв усталений стан, а не спалах до неї.
    await page.addInitScript(() => {
      try {
        document.documentElement.classList.add("hc");
      } catch {
        /* ignore */
      }
    });
    await bootstrap(page, path, { hub_theme_v2: "hc" });

    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.classList.contains("hc")),
      )
      .toBe(true);

    // Без цього скан у хвості entry-анімації бачить foreground, домножений
    // на альфу предка, — контраст, якого немає (див. `settleAnimations`).
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    expect(
      blocking.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        targets: v.nodes.slice(0, 3).map((n) => n.target),
      })),
      `axe serious/critical violations on ${path} under html.hc`,
    ).toEqual([]);
  });
}

// ── 2. Масштабований текст на найвужчій підтримуваній ширині ────────────
for (const { name, path } of ROUTES) {
  test(`text-scale: ${name} survives 200% root text at 320px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    // 200% від дефолтних 16px — верх діапазону iOS «Larger Text» і
    // приблизно найбільший крок Android «Text scaling».
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = "200%";
      });
    });
    await bootstrap(page, path);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    // Дати reflow осісти без таймера: два кадри + скінченні transition-и
    // (підписи нав-бару анімують `max-width`).
    await waitForNavLabelsExpanded(page);
    await nextFrames(page);
    await settleAnimations(page);

    const { scrollWidth, clientWidth } = await horizontalOverflow(page);
    const clipped = await clippedText(page);

    expect(
      { scrollWidth, clientWidth, clipped },
      `layout broke under 200% text on ${path}`,
    ).toMatchObject({ scrollWidth: clientWidth, clipped: [] });
  });
}

// ── 3. Reflow з відкритим оверлеєм ──────────────────────────────────────
test("overlay-reflow: the command palette does not overflow at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await bootstrap(page, "/");

  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const { scrollWidth, clientWidth } = await horizontalOverflow(page);
  expect(
    { scrollWidth, clientWidth },
    "command palette overflows the viewport at 320px",
  ).toMatchObject({ scrollWidth: clientWidth });
});

// ── 4. Чат при 200% тексту ──────────────────────────────────────────────
// Композер і шапка чату — рядки з кнопками фіксованої ролі (закрити,
// надіслати), а маршрути з `ROUTES` їх не рендерять: композер є лише в
// залогіненого (неавтентифікованому замість нього `ChatAuthGate`). Тому
// окремий тест зі світом, де є сесія. Регресія (bv-chat-large-text,
// 2026-11-23): поле вводу мало нативну мінімальну ширину (~20 символів),
// яка росте з текстом, тож при 200% «Надіслати» стояла на x=449 при
// вʼюпорті 320-390, а фокус у полі прокручував увесь чат убік і виносив
// за лівий край шапку з довідкою. Документ при цьому НЕ переповнювався
// (кліпер `overflow: hidden`), тож перевірка з розділу 2 була б зеленою:
// міряємо самі кнопки і кожен кліпер усередині чату.
const CHAT_CONTROLS = [
  "Команди: показати довідку",
  "Надіслати",
  "Нова бесіда",
  "Закрити чат",
] as const;

for (const { name, open } of [
  { name: "/chat", open: "/chat" },
  { name: "sheet", open: "/finyk" },
] as const) {
  for (const width of [320, 390]) {
    test(`text-scale: chat ${name} keeps its controls on screen under 200% text at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 780 });
      await installWorld(page, getWorld("finyk-month"));
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          document.documentElement.style.fontSize = "200%";
        });
      });
      await bootstrap(page, open);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      if (name === "sheet") {
        await page
          .getByRole("button", { name: "Відкрити Сержанта" })
          .first()
          .click();
      }
      const region = page
        .getByRole("region")
        .filter({ has: page.locator("#hub-chat-title") });
      const input = region.getByLabel("Повідомлення Сержанту");
      await expect(input).toBeVisible({ timeout: 15_000 });
      // Фокус у полі — те, що прокручувало переповнений чат убік.
      await input.fill("Привіт");
      await nextFrames(page);
      await settleAnimations(page);

      const report = await region.evaluate((root, labels) => {
        const vw = window.innerWidth;
        const offscreen: string[] = [];
        for (const label of labels) {
          const el = root.querySelector(`[aria-label="${label}"]`);
          if (!el) {
            offscreen.push(`${label}: missing`);
            continue;
          }
          const r = el.getBoundingClientRect();
          if (r.left < 0 || r.right > vw + 1) {
            offscreen.push(
              `${label}: ${Math.round(r.left)}..${Math.round(r.right)}`,
            );
          }
          if (r.width < 44 || r.height < 44) {
            offscreen.push(
              `${label}: ${Math.round(r.width)}x${Math.round(r.height)}`,
            );
          }
        }
        const clipped: string[] = [];
        for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
          const style = getComputedStyle(el);
          if (style.overflowX === "visible") continue;
          // Поле вводу прокручує власний текст — це норма, не обрізка.
          if (el instanceof HTMLInputElement) continue;
          // Три крапки — задумане вкорочення (пігулка лічильника AI віддає
          // простір першою, повне значення в aria-label); його стереже
          // `nav-label-fit.spec.ts` там, де воно заборонене.
          if (style.textOverflow === "ellipsis") continue;
          if (el.scrollWidth > el.clientWidth + 1) {
            const cls =
              typeof el.className === "string" ? el.className.trim() : "";
            clipped.push(
              `<${el.tagName.toLowerCase()}.${cls.split(/\s+/).slice(0, 3).join(".")}> ${el.scrollWidth}>${el.clientWidth}`,
            );
          }
        }
        return { offscreen, clipped: clipped.slice(0, 5) };
      }, CHAT_CONTROLS);

      expect(report, `chat ${name} at ${width}px under 200% text`).toEqual({
        offscreen: [],
        clipped: [],
      });
    });
  }
}
