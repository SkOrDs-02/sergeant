/**
 * Паритет дій рекомендацій: кожне значення `Rec.action`, яке віддає будь-який
 * продюсер рекомендацій, резолвиться в реальну дію хабу.
 *
 * Навіщо. `Rec.action` — просто `string`, тож компілятор пропустить що
 * завгодно. Так `weekly_digest_*` роками носив `action: "reports"`, а
 * «Відкрити» йде через `openModule`, який мовчки ігнорує все, що не є id
 * модуля, — і кнопка не робила нічого. Цей файл — механічний гейт на цей клас
 * дефектів: нова рекомендація з дією, якої хаб не вміє виконати, червонить
 * тест, а не лишається мертвою кнопкою в проді.
 *
 * Дія резолвиться, якщо вона:
 *  - id модуля хабу (`HUB_MODULE_IDS`) — «відкрити модуль» чи, з `pwaAction`,
 *    імперативна дія в ньому;
 *  - `WEEK_REPORT_ACTION` — «Звіт тижня» на хабі (`open_week_report`).
 *
 * Витяг статичний (як у `chatActions/toolParity.test.ts`): правила читають
 * сховища й час, тож прогнати їх усі з потрібними даними тут — друга, гірша
 * копія їхніх власних тестів. Файл перевіряє лише, ЯКІ дії досяжні.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Recommendations } from "@sergeant/insights";
import { HUB_MODULE_IDS, isHubModuleId } from "@shared/lib/modules/hubNav";
import type { Rec } from "../../lib/recommendationEngine";
import { mergeNowItems, withoutWeekReportTarget } from "./nowItems";

// Від локації самого тесту, не від cwd — прогін з кореня репо теж працює.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..", "..", "..");

/** Продюсери `Rec`: клієнтські правила + реєстр фінансових правил. */
const PRODUCER_FILES: readonly string[] = [
  join(REPO_ROOT, "apps/web/src/core/lib/recommendationEngine.ts"),
  ...readdirSync(
    join(REPO_ROOT, "packages/insights/src/recommendations/finance"),
  )
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) =>
      join(REPO_ROOT, "packages/insights/src/recommendations/finance", f),
    ),
];

/** Іменовані константи дій, які продюсери вживають замість літералів. */
const NAMED_ACTIONS: Readonly<Record<string, string>> = {
  WEEK_REPORT_ACTION: Recommendations.WEEK_REPORT_ACTION,
  "Recommendations.WEEK_REPORT_ACTION": Recommendations.WEEK_REPORT_ACTION,
};

interface FoundAction {
  file: string;
  expression: string;
  value: string | undefined;
}

/** Усі `action: <літерал | ім'я константи>` у продюсерах (не `pwaAction`). */
function collectProducedActions(): FoundAction[] {
  const found: FoundAction[] = [];
  for (const file of PRODUCER_FILES) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /(?<![A-Za-z])action:\s*("[^"]*"|[A-Za-z_][A-Za-z0-9_.]*)/g,
    )) {
      const expression = match[1] ?? "";
      const literal = /^"([^"]*)"$/.exec(expression);
      found.push({
        file: file.slice(REPO_ROOT.length + 1),
        expression,
        value: literal ? literal[1] : NAMED_ACTIONS[expression],
      });
    }
  }
  return found;
}

function rec(action: string): Rec {
  return {
    id: `probe_${action}`,
    module: "hub",
    priority: 50,
    icon: "info",
    title: "probe",
    body: "",
    action,
  };
}

describe("Rec.action: кожна дія, яку віддають продюсери, резолвиться", () => {
  const produced = collectProducedActions();

  it("витяг бачить продюсерів (гейт від гниття регулярки)", () => {
    // Станом на 2026-10-01: 10 літералів у recommendationEngine + фінансові
    // правила. Менше — отже регулярка розійшлась із кодом і гейт нічого не міряє.
    expect(produced.length).toBeGreaterThanOrEqual(15);
    expect(new Set(produced.map((p) => p.value))).toContain("finyk");
    expect(new Set(produced.map((p) => p.value))).toContain(
      Recommendations.WEEK_REPORT_ACTION,
    );
  });

  it("кожен вираз `action:` — або id модуля хабу, або відома константа", () => {
    const unresolved = produced.filter(
      (p) =>
        p.value === undefined ||
        !(
          isHubModuleId(p.value) ||
          p.value === Recommendations.WEEK_REPORT_ACTION
        ),
    );
    expect(
      unresolved.map((p) => `${p.file}: action: ${p.expression}`),
      "дія, якої хаб не вміє виконати (`openModule` її мовчки проковтне)",
    ).toEqual([]);
  });

  it("`mergeNowItems` перетворює кожну таку дію на досяжну ціль", () => {
    const values = [...new Set(produced.map((p) => p.value))].filter(
      (v): v is string => v !== undefined,
    );
    for (const value of values) {
      const [item] = mergeNowItems([rec(value)], []);
      const action = item?.action;
      expect(action, `action: ${value}`).toBeDefined();
      if (action?.kind === "open_module") {
        expect(isHubModuleId(action.module), `action: ${value}`).toBe(true);
      } else {
        expect(action?.kind, `action: ${value}`).toBe("open_week_report");
      }
    }
  });

  it("без блоку «Порада й тиждень» кожна ціль «Звіт тижня» теж досяжна, навіть у крос-модульної картки", () => {
    // `module: "hub"` — крос-модульні картки (понеділковий підсумок): модуля
    // в них немає, і повернення «в модуль» стало б тим самим «нікуди».
    for (const module of [...HUB_MODULE_IDS, "hub"] as const) {
      const [item] = mergeNowItems(
        [{ ...rec(Recommendations.WEEK_REPORT_ACTION), module }],
        [],
      );
      const fallback = withoutWeekReportTarget(item!).action;
      if (fallback.kind === "open_module") {
        expect(isHubModuleId(fallback.module), `module: ${module}`).toBe(true);
      } else {
        expect(fallback.kind, `module: ${module}`).toBe("navigate");
      }
    }
  });
});
