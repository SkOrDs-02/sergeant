import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { applyScenario } from "../utils/scenario";

/**
 * Pre-seed localStorage so the SPA can land directly on targeted hub
 * surfaces. Welcome intentionally runs without this seed.
 */
const SEEDED_LS: Record<string, string> = {
  hub_onboarding_done_v1: "1",
  // Банер згоди на аналітику не має перекривати UI під тестом (рішення «ні»).
  "sergeant.analytics_consent_decision.v1": JSON.stringify({ v: "denied" }),
  hub_first_action_done_v1: "1",
  hub_first_real_entry_done_v1: "1",
  hub_onboarding_vibes_v1: JSON.stringify([
    "finyk",
    "fizruk",
    "nutrition",
    "routine",
  ]),
  hub_vibe_picks_v1: JSON.stringify({
    picks: ["finyk", "fizruk", "nutrition", "routine"],
    firstActionPending: null,
    firstActionStartedAt: null,
    firstRealEntryAt: Date.now(),
    updatedAt: Date.now(),
  }),
};

const PRE_FTUX_LS: Record<string, string> = {
  hub_onboarding_done_v1: "1",
  // Банер згоди на аналітику не має перекривати UI під тестом (рішення «ні»).
  "sergeant.analytics_consent_decision.v1": JSON.stringify({ v: "denied" }),
  hub_first_action_pending_v1: "1",
  hub_first_action_started_at_v1: String(Date.now()),
  hub_onboarding_vibes_v1: JSON.stringify([
    "finyk",
    "fizruk",
    "nutrition",
    "routine",
  ]),
  hub_vibe_picks_v1: JSON.stringify({
    picks: ["finyk", "fizruk", "nutrition", "routine"],
    firstActionPending: "finyk",
    firstActionStartedAt: Date.now(),
    firstRealEntryAt: null,
    updatedAt: Date.now(),
  }),
};

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

async function seedLocalStorage(
  page: Page,
  seed: Record<string, string> | null = SEEDED_LS,
) {
  if (!seed) return;

  await page.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [k, v] of Object.entries(entries)) {
        window.localStorage.setItem(k, v);
      }
    } catch {
      /* ignore */
    }
  }, seed);
}

/**
 * Themed variant of `hub_theme_v2` (see `useTheme.ts`) — `"dark"` and
 * `"hc"` are the two non-light choices that ship their own runtime
 * contrast tokens (`html.dark`, `html.hc`). Merged into `SEEDED_LS` so
 * themed runs keep the same FTUX-skipping seed as the light-theme pass.
 */
type ThemedChoice = "dark" | "hc";

/**
 * Belt-and-braces: `hub_theme_v2` alone only takes effect once
 * `useTheme()` mounts and resolves the choice on the first render. Also
 * stamping `documentElement` classList in the init script means the very
 * first paint (before React hydrates) is already themed, matching what a
 * returning user with a persisted choice sees — the axe scan should audit
 * steady-state contrast, not the pre-hydration flash.
 */
async function seedTheme(page: Page, theme: ThemedChoice) {
  await page.addInitScript((mode: ThemedChoice) => {
    try {
      document.documentElement.classList.add(mode === "dark" ? "dark" : "hc");
    } catch {
      /* ignore */
    }
  }, theme);
}

function isNavigationRace(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("Execution context was destroyed")
  );
}

/**
 * Дочекатись, поки доїдуть entry-анімації, і лише тоді знімати кольори.
 *
 * axe міряє контраст по computed-стилях у момент виклику, а `opacity`
 * предка домножує foreground на альфу. Блоки хаба заїжджають через
 * `stagger-in` (`StaggerChild`, 320 ms, opacity 0 → 1), lazy-контент —
 * через `SuspenseWithMinDelay` (`animate-fade-in`, 220 ms). Скан, що
 * потрапив у хвіст такої анімації, бачить «розбавлений» текст: на #72
 * (run 35117972018, 2026-09-16) заголовок «Модулі» дав 3.75:1 із
 * foreground `#6e756f` — це `--c-muted` #535c56 при opacity ≈0.83 на столі
 * хаба, а підказки карток — 4.49:1 із `#79736d` замість `--c-subtle`
 * #605a54. Той самий коміт на другому прогоні зелений: різниця лише в
 * тому, коли мережа затихла відносно маунту сітки.
 *
 * Чекаємо лише СКІНЧЕННІ анімації (лупи shimmer/pulse ніколи не
 * закінчуються) і кількома проходами, бо stagger-діти стартують із
 * затримкою до 150 ms, а Suspense-контент може змонтуватись після першого
 * проходу. Стеля — 3 с: анімація, яку хтось поставив на паузу, не має
 * вішати тест. Та сама схема, що в `tests/mobile/audit.ts` (там rect-и,
 * тут кольори — мотив один: міряти кадр, який уже приземлився).
 */
async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    const deadline = performance.now() + 3_000;
    for (let pass = 0; pass < 5; pass++) {
      const pending = document
        .getAnimations()
        .filter(
          (a) =>
            a.playState !== "finished" &&
            a.effect?.getComputedTiming().iterations !== Infinity,
        );
      const budget = deadline - performance.now();
      if (pending.length === 0 || budget <= 0) return;
      await Promise.race([
        Promise.all(pending.map((a) => a.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, budget)),
      ]);
    }
  });
}

async function analyzeA11y(page: Page) {
  await settleAnimations(page);
  try {
    return await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  } catch (error) {
    if (!isNavigationRace(error)) throw error;
    await page.waitForLoadState("domcontentloaded").catch(() => {
      /* retry after transient navigation race */
    });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {
      /* allow-through: some surfaces keep long-polling connections open */
    });
    // Навігація перезапустила entry-анімації — дочекатись їх ще раз.
    await settleAnimations(page);
    return await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  }
}

type AxeViolation = Awaited<
  ReturnType<AxeBuilder["analyze"]>
>["violations"][number];

// CodeRabbit post-merge review PR #757 (зауваження #5): цей предикат разом
// із восьмирядковим коментарем-поясненням був продубльований у двох місцях
// (незалежний theme-цикл нижче повторював той самий фільтр). Один хелпер,
// кліканий з обох local-циклів (light-theme `SURFACES` і `THEMED_SURFACES`)
// — зміна порогу блокування тепер редагується один раз, а не ризикує
// розійтись між двома копіями.
function isBlockingViolation(v: AxeViolation): boolean {
  return (
    v.impact === "serious" ||
    v.impact === "critical" ||
    // Дефект №5 (адверсарне ревʼю 2026-08-08): `heading-order`
    // (settings h1→h3 outline, тепер полагоджено на h1→h2→h3 —
    // `SettingsGroup` заголовок став справжнім `<h2>`) має impact
    // `moderate`, тож без цього рядка serious/critical-фільтр не ловив
    // би його ВЗАГАЛІ. Звужено САМЕ до `heading-order` (а не до всього
    // impact "moderate") навмисно: інші moderate-правила на інших
    // сторінках можуть мати неповʼязані latent-порушення поза обсягом
    // цього фіксу — ширший фільтр раптово зачервонив би їхні тести.
    v.id === "heading-order"
  );
}

const SURFACES: Array<{
  name: string;
  path: string;
  seed?: Record<string, string> | null;
}> = [
  { name: "welcome", path: "/welcome", seed: null },
  { name: "hub-pre-ftux", path: "/", seed: PRE_FTUX_LS },
  { name: "hub-root", path: "/", seed: SEEDED_LS },
  { name: "finyk-overview", path: "/?module=finyk", seed: SEEDED_LS },
  { name: "fizruk-dashboard", path: "/?module=fizruk", seed: SEEDED_LS },
  { name: "nutrition-dashboard", path: "/?module=nutrition", seed: SEEDED_LS },
  { name: "routine-dashboard", path: "/?module=routine", seed: SEEDED_LS },
  { name: "auth-sign-in", path: "/sign-in", seed: SEEDED_LS },
  { name: "design-showcase", path: "/design", seed: SEEDED_LS },
  { name: "hub-reports-tab", path: "/?tab=reports", seed: SEEDED_LS },
  { name: "pricing", path: "/pricing", seed: SEEDED_LS },
  { name: "chat", path: "/chat", seed: SEEDED_LS },
  { name: "assistant-catalogue", path: "/assistant", seed: SEEDED_LS },
  { name: "insights", path: "/insights", seed: SEEDED_LS },
  { name: "settings", path: "/settings", seed: SEEDED_LS },
  { name: "finyk-transactions", path: "/finyk", seed: SEEDED_LS },
  { name: "routine-home", path: "/routine", seed: SEEDED_LS },
  { name: "nutrition-menu", path: "/nutrition/menu", seed: SEEDED_LS },
];

for (const { name, path, seed } of SURFACES) {
  test(`a11y: ${name} has no serious/critical violations`, async ({ page }) => {
    await seedLocalStorage(page, seed);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {
        /* allow-through: some surfaces keep long-polling connections open */
      });
    await page
      .locator("main, [role='main'], [data-a11y-root], #root > *")
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    const results = await analyzeA11y(page);

    const blocking = results.violations.filter(isBlockingViolation);

    if (blocking.length > 0) {
      const summary = blocking
        .map((v) => {
          const nodes = v.nodes
            .slice(0, 3)
            .map((node, index) => {
              const target = node.target.join(" ");
              const html = node.html.replace(/\s+/g, " ").slice(0, 220);
              const failure = node.failureSummary
                ? `\n      ${node.failureSummary.replace(/\s+/g, " ")}`
                : "";
              return `    ${index + 1}. ${target}\n      ${html}${failure}`;
            })
            .join("\n");
          return `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${
            v.nodes.length === 1 ? "" : "s"
          })\n    ${v.helpUrl}\n${nodes}`;
        })
        .join("\n");
      throw new Error(
        `axe found ${blocking.length} serious/critical violation(s) on ${path}:\n${summary}`,
      );
    }

    const softCount = results.violations.length - blocking.length;
    if (softCount > 0) {
      test.info().annotations.push({
        type: "axe-soft",
        description: `${softCount} non-blocking violation(s) on ${path} (minor/moderate).`,
      });
    }

    // `incomplete` — не «все гаразд», а «axe не зміг вирішити». Для
    // `color-contrast` це рівно випадок градієнтного фону: правило не
    // вміє визначити колір тла під текстом і мовчки здається, а фільтр
    // вище дивиться ЛИШЕ на `violations`. Саме так провалений контраст
    // `text-hero-ink/70` на геро-градієнті Premium проїхав повз цей
    // лейн непоміченим (аудит шуму 2026-09-16, WF-23).
    //
    // Не робимо блокуючим навмисно: `incomplete` за визначенням не є
    // доказом порушення, і перевести його в red означало б зачервонити
    // кожен градієнт у продукті. Але воно перестає бути НЕВИДИМИМ —
    // тепер його видно в звіті з назвою поверхні й кількістю вузлів,
    // тобто є з чого почати ручний замір. Числову перевірку альфи на
    // геро-чорнилі несе `packages/design-tokens/contrast.test.js`, а
    // лічильник call-site-ів — метрика `heroInkAlpha` у храповику.
    const undecidedContrast = results.incomplete.filter(
      (r) => r.id === "color-contrast",
    );
    if (undecidedContrast.length > 0) {
      const nodes = undecidedContrast.reduce(
        (sum, r) => sum + r.nodes.length,
        0,
      );
      test.info().annotations.push({
        type: "axe-contrast-undecided",
        description:
          `${nodes} вузл(ів) на ${path}, де axe НЕ ЗМІГ порахувати контраст ` +
          `(типово — текст на градієнті). Це не порушення і не гарантія: ` +
          `міряй вручну, якщо поверхня геройська.`,
      });
    }

    expect(
      consoleErrors.filter(
        (e) =>
          !e.includes("workbox") &&
          !e.includes("Service worker") &&
          !e.includes("Failed to load resource"),
      ),
      `console errors on ${path}:\n${consoleErrors.join("\n")}`,
    ).toEqual([]);
  });
}

const SCENARIO_SURFACES = [
  {
    name: "pantry-receipt-names",
    id: "pantry-receipt-names",
    path: "/nutrition/pantry",
  },
  { name: "finyk-month", id: "finyk-month", path: "/finyk" },
  { name: "routine-streaks", id: "routine-streaks", path: "/routine" },
  {
    name: "fizruk-active-session",
    id: "fizruk-active-session",
    path: "/fizruk/workouts",
  },
] as const;

for (const { name, id, path } of SCENARIO_SURFACES) {
  test(`a11y: ${name} world has no serious/critical violations`, async ({
    page,
  }) => {
    await seedLocalStorage(page, SEEDED_LS);
    await applyScenario(page, id, path);
    const results = await analyzeA11y(page);
    const blocking = results.violations.filter(isBlockingViolation);
    expect(blocking, `axe violations on ${path}`).toEqual([]);
  });
}

/**
 * Themed subset — dark and hc ship their own contrast tokens
 * (`html.dark` / `html.hc` in `src/styles/theme.css`) and previously ran
 * completely unaudited: every case above only ever exercises the
 * light-theme default. Bounded to a representative slice (hub root,
 * design-showcase, one module dashboard, settings) rather than the full
 * `SURFACES` matrix to keep the added run count in check.
 */
const THEMED_SURFACES: Array<{
  name: string;
  path: string;
  seed: Record<string, string>;
  theme: ThemedChoice;
}> = (
  [
    { name: "hub-root", path: "/" },
    { name: "design-showcase", path: "/design" },
    { name: "fizruk-dashboard", path: "/?module=fizruk" },
    { name: "settings", path: "/settings" },
    // `/pricing` доданий 2026-09-17: Premium-картка рендериться
    // `prominence="hero"`, тобто несе саме той градієнт, на якому
    // провалився контраст (WF-23), а темна й HC-теми мають ВЛАСНІ
    // геро-токени (`--hero-ink-*`), тож світлого прогону для них замало.
    { name: "pricing", path: "/pricing" },
  ] as const
).flatMap(({ name, path }) =>
  (["dark", "hc"] as const).map((theme) => ({
    name,
    path,
    seed: { ...SEEDED_LS, hub_theme_v2: theme },
    theme,
  })),
);

for (const { name, path, seed, theme } of THEMED_SURFACES) {
  test(`a11y: ${name} [${theme}] has no serious/critical violations`, async ({
    page,
  }) => {
    await seedLocalStorage(page, seed);
    await seedTheme(page, theme);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {
        /* allow-through: some surfaces keep long-polling connections open */
      });
    await page
      .locator("main, [role='main'], [data-a11y-root], #root > *")
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    const results = await analyzeA11y(page);

    const blocking = results.violations.filter(isBlockingViolation);

    if (blocking.length > 0) {
      const summary = blocking
        .map((v) => {
          const nodes = v.nodes
            .slice(0, 3)
            .map((node, index) => {
              const target = node.target.join(" ");
              const html = node.html.replace(/\s+/g, " ").slice(0, 220);
              const failure = node.failureSummary
                ? `\n      ${node.failureSummary.replace(/\s+/g, " ")}`
                : "";
              return `    ${index + 1}. ${target}\n      ${html}${failure}`;
            })
            .join("\n");
          return `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${
            v.nodes.length === 1 ? "" : "s"
          })\n    ${v.helpUrl}\n${nodes}`;
        })
        .join("\n");
      throw new Error(
        `axe found ${blocking.length} serious/critical violation(s) on ${path} [${theme}]:\n${summary}`,
      );
    }

    const softCount = results.violations.length - blocking.length;
    if (softCount > 0) {
      test.info().annotations.push({
        type: "axe-soft",
        description: `${softCount} non-blocking violation(s) on ${path} [${theme}] (minor/moderate).`,
      });
    }

    expect(
      consoleErrors.filter(
        (e) =>
          !e.includes("workbox") &&
          !e.includes("Service worker") &&
          !e.includes("Failed to load resource"),
      ),
      `console errors on ${path} [${theme}]:\n${consoleErrors.join("\n")}`,
    ).toEqual([]);
  });
}
