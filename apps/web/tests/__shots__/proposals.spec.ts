/**
 * Знімальний прогін «зараз / пропоную» для рев'ю редизайну v3.2
 * (docs/work/specs/planning/redesign-v3-2.md, інвентар
 * docs/work/specs/audits/2026-10-23-redesign-v3-2-review.md).
 *
 * Для кожної позиції 01-18: `*-before.png` — живий екран, `*-after.png` — той
 * самий екран після DOM-правок у `mutate`, які імітують погоджену пропозицію.
 * Це не тест і не гейт: асертів немає, кадри лягають поза git. Коли позицію
 * закрито в коді, її `mutate` стає no-op і кадри «до / після» мають збігатись —
 * так сценарій служить приймальним для спеки.
 *
 * Запуск той самий, що в README.md поруч (preview-білд із `VITE_E2E_SEED=true`),
 * далі:
 *   PROP_OUT=test-results/proposals pnpm --filter @sergeant/web exec playwright \
 *     test --config playwright.shots.config.ts proposals.spec.ts
 *   PROP_ONLY=04-choice-borders,16-hub-now  — лише названі позиції
 *   PROP_FAST=1                             — коротша пауза після сіду (ловить тост 14)
 *
 * Status: Scaffolded
 */
import { test, type Page } from "@playwright/test";
import { applyScenario } from "../utils/scenario";
import { seedFTUX } from "../utils/seedFTUX";

type World = Parameters<typeof applyScenario>[1];
const OUT = process.env["PROP_OUT"] ?? "test-results/proposals";
const pause = (p: Page, ms = 900) => p.waitForTimeout(ms);

async function open(page: Page, world: World, path: string) {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await seedFTUX(page, "post-ftux", { theme: "light" });
  await applyScenario(page, world, path);
  const decline = page.getByRole("button", { name: "Ні, дякую" });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.waitForTimeout(process.env["PROP_FAST"] ? 400 : 1500);
}
const addThen = async (page: Page, row: RegExp) => {
  await page
    .getByTestId("corner-action")
    .getByRole("button", { name: "Додати" })
    .click();
  await pause(page);
  await page
    .getByTestId("add-sources")
    .getByRole("button", { name: row })
    .click();
  await pause(page);
};
const scrollEnd = async (page: Page) => {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll("*"))) {
        if (
          el.scrollHeight > el.clientHeight + 10 &&
          /auto|scroll/.test(getComputedStyle(el).overflowY)
        )
          el.scrollTop = el.scrollHeight;
      }
    });
    await page.waitForTimeout(500);
  }
};
const removeByText = (
  page: Page,
  text: string | RegExp,
  role: "button" | "text" = "button",
) =>
  page.evaluate(
    ({ t, isRe, flags, role }) => {
      const re = isRe ? new RegExp(t, flags) : null;
      const match = (s: string) => (re ? re.test(s.trim()) : s.trim() === t);
      const nodes =
        role === "button"
          ? document.querySelectorAll("button")
          : document.querySelectorAll("p,span,div,h1,h2,h3");
      for (const el of Array.from(nodes)) {
        if (match(el.textContent || "")) el.remove();
      }
    },
    {
      t: text instanceof RegExp ? text.source : text,
      isRe: text instanceof RegExp,
      flags: text instanceof RegExp ? text.flags : "",
      role,
    },
  );
const css = (page: Page, text: string) => page.addStyleTag({ content: text });

type Case = {
  name: string;
  world: World;
  path: string;
  prep?: (p: Page) => Promise<void>;
  mutate: (p: Page) => Promise<void>;
  after?: (p: Page) => Promise<void>;
};

const CASES: Case[] = [
  {
    name: "01-dup-add-nutrition-log",
    world: "nutrition-day",
    path: "/nutrition/log",
    mutate: async (p) => {
      await p.evaluate(() => {
        for (const b of Array.from(document.querySelectorAll("button")))
          if (
            (b.textContent || "").trim() === "Додати прийом їжі" &&
            !b.closest("[data-testid=corner-action]")
          )
            b.remove();
      });
    },
  },
  {
    name: "02-dup-add-finyk-assets",
    world: "finyk-month",
    path: "/finyk/assets",
    mutate: async (p) => {
      await removeByText(p, /^\+\s*Актив$/);
      await removeByText(p, /^\+\s*Пасив$/);
    },
  },
  {
    name: "03-dup-add-finyk-plan",
    world: "finyk-month",
    path: "/finyk/budgets",
    mutate: async (p) => {
      await removeByText(p, /^\+\s*Запланувати$/);
      // тинт під навігаційним рядком → панель
      await p.evaluate(() => {
        for (const el of Array.from(
          document.querySelectorAll(".bg-finyk-tint"),
        )) {
          if ((el.textContent || "").includes("План на місяць")) {
            el.classList.remove("bg-finyk-tint");
            el.classList.add("bg-panel");
          }
        }
      });
    },
  },
  {
    name: "04-choice-borders",
    world: "finyk-month",
    path: "/finyk",
    prep: (p) => addThen(p, /^Вручну/),
    mutate: async (p) => {
      await css(
        p,
        `[role="radio"].border-control,[role="checkbox"].border-control{border-color:transparent!important}`,
      );
    },
  },
  {
    name: "05-finyk-hero",
    world: "finyk-month",
    path: "/finyk",
    mutate: async (p) => {
      await p.evaluate(() => {
        // пояснення під заголовком
        for (const el of Array.from(document.querySelectorAll("p")))
          if ((el.textContent || "").startsWith("Він рахується")) el.remove();
        // підказка до чарта + «Зрозуміло»
        document.querySelector('[role="note"]')?.remove();
        // капітал → окрема панель під hero
        const cap = Array.from(document.querySelectorAll("div")).find(
          (d) =>
            d.classList.contains("border-t") &&
            (d.textContent || "").startsWith("Капітал"),
        );
        const hero = document.querySelector(".bg-finyk-tint");
        if (cap && hero && hero.parentElement) {
          cap.classList.remove("border-t", "border-line", "pt-3", "mt-4");
          const panel = document.createElement("div");
          panel.className = "bg-panel rounded-panel p-5 text-text";
          panel.appendChild(cap);
          hero.insertAdjacentElement("afterend", panel);
        }
        // статус-рядок синку
        for (const el of Array.from(document.querySelectorAll("span")))
          if ((el.textContent || "").trim() === "Синхронізовано")
            el.closest("div")?.remove();
      });
    },
  },
  {
    name: "06-finyk-limits-border",
    world: "finyk-month",
    path: "/finyk",
    prep: scrollEnd,
    mutate: async (p) => {
      await p.evaluate(() => {
        for (const b of Array.from(document.querySelectorAll("button")))
          if (/використано/.test(b.textContent || "")) {
            b.classList.forEach((c) => {
              if (c.startsWith("border")) b.classList.remove(c);
            });
          }
        for (const el of Array.from(document.querySelectorAll("p")))
          if ((el.textContent || "").startsWith("Прогноз обмежений"))
            el.remove();
      });
      await scrollEnd(p);
    },
  },
  {
    name: "07-tx-status-strip",
    world: "finyk-month",
    path: "/finyk/transactions",
    mutate: async (p) => {
      await p.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll("div,p")))
          if (
            /^синхронізовано/.test((el.textContent || "").trim()) &&
            (el.textContent || "").includes("оновлено")
          ) {
            el.remove();
            break;
          }
      });
    },
  },
  {
    name: "08-analytics-period-nav",
    world: "finyk-month",
    path: "/finyk/analytics",
    mutate: async (p) => {
      await p.evaluate(() => {
        const h1 = Array.from(document.querySelectorAll("h1")).find(
          (h) => h.textContent === "Аналіз",
        );
        const nav = h1?.nextElementSibling as HTMLElement | null;
        if (!nav) return;
        nav.querySelectorAll("button").forEach((b, i) => {
          if (i === 0 || i === 2) {
            b.classList.remove("border", "border-line", "rounded-lg");
            b.classList.add("text-text");
          }
          if (i === 1) {
            b.querySelector("svg")?.remove();
          }
        });
      });
    },
  },
  {
    name: "09-fizruk-stat-tiles",
    world: "fizruk-active-session",
    path: "/fizruk/progress",
    mutate: async (p) => {
      await p.evaluate(() => {
        const grid = Array.from(
          document.querySelectorAll(".grid.grid-cols-2"),
        ).find((g) => (g.textContent || "").includes("жиру"));
        if (grid) {
          const panel = document.createElement("div");
          panel.className = "bg-panel rounded-panel px-5";
          const row = (label: string, val: string, last = false) => {
            const r = document.createElement("div");
            r.className =
              "flex items-center justify-between min-h-[52px] text-style-label" +
              (last ? "" : " border-b border-line");
            r.innerHTML = `<span class="text-text font-semibold">${label}</span><span class="text-muted tabular-nums">${val}</span>`;
            return r;
          };
          panel.appendChild(row("Вага", "—"));
          panel.appendChild(row("% жиру", "—", true));
          grid.replaceWith(panel);
        }
        for (const h of Array.from(
          document.querySelectorAll("h3.text-style-overline"),
        )) {
          h.className = "text-style-title font-bold text-text mb-3";
          h.textContent = "Обʼєм по мʼязах";
        }
        for (const el of Array.from(document.querySelectorAll("p")))
          if ((el.textContent || "").startsWith("Умовні одиниці")) el.remove();
      });
    },
  },
  {
    name: "10-raw-select",
    world: "nutrition-day",
    path: "/nutrition/menu",
    prep: scrollEnd,
    mutate: async (p) => {
      await css(
        p,
        `select{appearance:none;-webkit-appearance:none;height:48px!important;border-radius:8px!important;border:1px solid #c9c9c5!important;background:#fbfbfa url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 20 20'><path d='M5 7l5 6 5-6' stroke='%236e6e73' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>") no-repeat right 12px center!important;padding-right:36px!important}`,
      );
      await p.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll("p,span")))
          if ((el.textContent || "").startsWith("Склади план")) el.remove();
        for (const el of Array.from(document.querySelectorAll("p,span")))
          if (
            (el.textContent || "").startsWith("Автокалібрування вмикається")
          ) {
            const b = document.createElement("button");
            b.className =
              "touch-target rounded-lg px-1 text-style-label font-semibold text-text";
            b.textContent = "Автокалібрування";
            el.replaceWith(b);
          }
      });
      await scrollEnd(p);
    },
  },
  {
    name: "11-routine-row-affordances",
    world: "routine-streaks",
    path: "/routine",
    mutate: async (p) => {
      await removeByText(p, "Нотатка");
      await p.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll("p,span,div")))
          if ((el.textContent || "").trim() === "пт, 23 жовт. · Звичка")
            el.textContent = "пт, 23 жовт.";
        for (const b of Array.from(document.querySelectorAll("button")))
          if (
            (b.textContent || "").trim() === "Відмітити всі звички на цей день"
          )
            b.textContent = "Відмітити всі";
      });
    },
  },
  {
    name: "12-routine-habits-explainers",
    world: "routine-streaks",
    path: "/routine/habits",
    mutate: async (p) => {
      await removeByText(p, "Змінити");
      await p.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll("p")))
          if (
            /^(Тут можна створювати|Перетягни звичку)/.test(
              (el.textContent || "").trim(),
            )
          )
            el.remove();
        document
          .querySelector('input[placeholder="Пошук у списку звичок"]')
          ?.closest("div")
          ?.remove();
      });
    },
  },
  {
    name: "13-routine-feed-filters",
    world: "routine-streaks",
    path: "/routine",
    prep: scrollEnd,
    mutate: async (p) => {
      await p.evaluate(() => {
        document
          .querySelector('input[placeholder="Пошук у стрічці"]')
          ?.closest("div")
          ?.remove();
        for (const el of Array.from(document.querySelectorAll("div,span")))
          if ((el.textContent || "").trim() === "Фільтр") {
            el.parentElement?.remove();
            break;
          }
        for (const el of Array.from(document.querySelectorAll("div")))
          if ((el.textContent || "").trim() === "30 днів поспіль.")
            el.closest('[role="status"],[role="alert"],div.fixed')?.remove();
      });
      await scrollEnd(p);
    },
  },
  {
    name: "14-streak-toast",
    world: "routine-streaks",
    path: "/routine",
    prep: async (p) => {
      await p
        .getByRole("button", { name: "Нова звичка", exact: true })
        .first()
        .click();
      await pause(p, 300);
    },
    mutate: async (p) => {
      await p.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll("div")))
          if ((el.textContent || "").trim() === "30 днів поспіль.") {
            (
              el.closest('[role="status"],[role="alert"],.fixed') || el
            ).remove();
            break;
          }
      });
    },
  },
  {
    name: "15-readiness-auto-sheet",
    world: "fizruk-active-session",
    path: "/fizruk/workouts",
    mutate: async (p) => {
      await p.keyboard.press("Escape").catch(() => {});
      await pause(p, 600);
      await p.evaluate(() => {
        document.querySelector('[role="dialog"]')?.remove();
        // тиха кнопка «Самопочуття» поруч із «Записати проведене»
        const src = Array.from(document.querySelectorAll("button")).find(
          (b) => (b.textContent || "").trim() === "Записати проведене",
        );
        if (src) {
          const b = src.cloneNode(true) as HTMLButtonElement;
          b.textContent = "Самопочуття";
          src.insertAdjacentElement("afterend", b);
        }
        document.querySelector("[data-testid=corner-action]")?.remove();
      });
    },
  },
  {
    name: "16-hub-now",
    world: "finyk-month",
    path: "/",
    mutate: async (p) => {
      await p.evaluate(() => {
        for (const el of Array.from(
          document.querySelectorAll("h1,h2,p,div,span"),
        ))
          if (
            /^П’ятниця, 23 жовтня$/.test((el.textContent || "").trim()) &&
            el.children.length === 0
          ) {
            (el as HTMLElement).style.setProperty(
              "font-size",
              "26px",
              "important",
            );
            (el as HTMLElement).style.setProperty(
              "line-height",
              "1.1",
              "important",
            );
          }
        for (const el of Array.from(document.querySelectorAll("p,span,div"))) {
          const t = (el.textContent || "").trim();
          if (
            t === "Сьогодні ще немає записів про їжу" &&
            el.children.length === 0
          )
            el.textContent = "Їжа: сьогодні 0 записів";
          if (
            t.startsWith("Зафіксуй свій прийом їжі") &&
            el.children.length === 0
          )
            el.remove();
        }
        // чекбокс у рядку «Переглянути аналітику» → лише дія
        for (const li of Array.from(document.querySelectorAll("li")))
          if ((li.textContent || "").includes("Переглянути аналітику"))
            li.querySelector("span.border-2")?.remove();
        for (const el of Array.from(
          document.querySelectorAll("nav span,nav div"),
        ))
          if (
            (el.textContent || "").trim() === "Увійти" &&
            el.children.length === 0
          )
            el.textContent = "Профіль";
      });
    },
  },
  {
    name: "17-empty-state-icon",
    world: "empty",
    path: "/nutrition/log",
    mutate: async (p) => {
      await p.evaluate(() => {
        const h = Array.from(document.querySelectorAll("h2,h3,p")).find(
          (e) => (e.textContent || "").trim() === "Поки немає записів",
        );
        const box = h?.parentElement;
        box?.querySelector("svg")?.parentElement?.remove();
        for (const b of Array.from(document.querySelectorAll("button")))
          if (
            (b.textContent || "").trim() === "Додати прийом їжі" &&
            !b.closest("[data-testid=corner-action]")
          )
            b.remove();
        for (const el of Array.from(document.querySelectorAll("p")))
          if ((el.textContent || "").startsWith("Додай перший прийом"))
            el.textContent = "Сьогодні 0 записів.";
        // контроли без предмета
        for (const el of Array.from(
          document.querySelectorAll("h2,h3,div,span"),
        ))
          if (
            /^(Пошук по журналу|Аналітика \(тренди\))$/.test(
              (el.textContent || "").trim(),
            )
          ) {
            const sec = el.closest("section") || el.parentElement;
            sec?.remove();
          }
        for (const el of Array.from(document.querySelectorAll("p,div")))
          if ((el.textContent || "").trim() === "Ще немає трендів") el.remove();
      });
    },
  },
  {
    name: "18-hue-in-controls",
    world: "nutrition-day",
    path: "/nutrition/menu",
    prep: scrollEnd,
    mutate: async (p) => {
      await p.evaluate(() => {
        for (const b of Array.from(document.querySelectorAll("button"))) {
          if ((b.textContent || "").trim() === "Згенерувати денний план") {
            b.classList.forEach((c) => {
              if (/^(bg-|text-|hover:bg-|active:bg-)/.test(c))
                b.classList.remove(c);
            });
            b.classList.add("bg-text", "text-bg");
          }
        }
      });
      await scrollEnd(p);
    },
  },
];

const only = process.env["PROP_ONLY"];
for (const c of CASES) {
  if (only && !only.split(",").includes(c.name)) continue;
  test(c.name, async ({ page }) => {
    await open(page, c.world, c.path);
    if (c.prep) await c.prep(page);
    await page.screenshot({ path: `${OUT}/${c.name}-before.png` });
    await c.mutate(page);
    await pause(page, 500);
    await page.screenshot({ path: `${OUT}/${c.name}-after.png` });
  });
}
