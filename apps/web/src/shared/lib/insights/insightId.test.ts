import { describe, it, expect } from "vitest";
import {
  parseInsightId,
  UNKNOWN_INSIGHT_KIND,
  type ParsedInsightId,
} from "./insightId";

// Таблиця дзеркалить УСІ 9 продуктових сигналів, що рендеряться через
// `InsightCard`. Якщо хтось додасть 10-й сигнал і забуде реєстр —
// цей файл лишиться зеленим, а от `unknown`-кейс нижче пояснює, чому
// це видно на дашборді, а не губиться.
const CASES: ReadonlyArray<readonly [string, ParsedInsightId]> = [
  // Змінний суфікс — categoryId кастомної категорії (potential PII).
  [
    "finyk-budget-overrun-food",
    { module: "finyk", kind: "finyk-budget-overrun" },
  ],
  [
    "finyk-budget-overrun-cat_9f2b1c",
    { module: "finyk", kind: "finyk-budget-overrun" },
  ],
  // Змінний суфікс — місяць (high-cardinality).
  [
    "finyk-coffee-limit-2026-07",
    { module: "finyk", kind: "finyk-coffee-limit" },
  ],
  // Стабільні id без суфікса.
  [
    "finyk-recurring-detected",
    { module: "finyk", kind: "finyk-recurring-detected" },
  ],
  [
    "fizruk-rest-day-overdue",
    { module: "fizruk", kind: "fizruk-rest-day-overdue" },
  ],
  ["fizruk-pr-pending", { module: "fizruk", kind: "fizruk-pr-pending" }],
  [
    "routine-streak-record-pending",
    { module: "routine", kind: "routine-streak-record-pending" },
  ],
  ["routine-todo-evening", { module: "routine", kind: "routine-todo-evening" }],
  [
    "nutrition-protein-low",
    { module: "nutrition", kind: "nutrition-protein-low" },
  ],
  // Змінний суфікс — ISO-тиждень (high-cardinality).
  [
    "nutrition-streak-7-days-2026-W30",
    { module: "nutrition", kind: "nutrition-streak-7-days" },
  ],
];

describe("parseInsightId", () => {
  it.each(CASES)("розбирає %s", (id, expected) => {
    expect(parseInsightId(id)).toEqual(expected);
  });

  it("усі 9 відомих сигналів мають валідний module (не unknown)", () => {
    for (const [id] of CASES) {
      const { kind, module } = parseInsightId(id);
      expect(id.startsWith(kind)).toBe(true);
      expect(module).not.toBe(UNKNOWN_INSIGHT_KIND);
    }
  });

  it("зрізає ЗМІННИЙ суфікс — саме ці три id несуть PII/кардинальність", () => {
    // Три id з реального коду, у яких суфікс змінний. `kind` мусить бути
    // СТРОГО коротшим за id — інакше сирий categoryId / місяць / тиждень
    // поїхав би у PostHog-property.
    for (const id of [
      "finyk-budget-overrun-cat_9f2b1c",
      "finyk-coffee-limit-2026-07",
      "nutrition-streak-7-days-2026-W30",
    ]) {
      expect(parseInsightId(id).kind.length).toBeLessThan(id.length);
    }
  });

  it("не матчить довший сусідній префікс як відомий kind", () => {
    // `finyk-coffee-limitless` НЕ є `finyk-coffee-limit` + суфікс:
    // longest-prefix match вимагає роздільник `-`.
    expect(parseInsightId("finyk-coffee-limitless")).toEqual({
      module: "finyk",
      kind: UNKNOWN_INSIGHT_KIND,
    });
  });

  it("незнайомий id у відомому модулі → kind unknown, module з сегмента", () => {
    expect(parseInsightId("routine-brand-new-signal")).toEqual({
      module: "routine",
      kind: UNKNOWN_INSIGHT_KIND,
    });
  });

  it("незнайомий модуль не протікає у property (кардинальність)", () => {
    expect(parseInsightId("hub-something-else")).toEqual({
      module: UNKNOWN_INSIGHT_KIND,
      kind: UNKNOWN_INSIGHT_KIND,
    });
  });

  it("порожній / нерядковий id не кидає", () => {
    expect(parseInsightId("")).toEqual({
      module: UNKNOWN_INSIGHT_KIND,
      kind: UNKNOWN_INSIGHT_KIND,
    });
    expect(parseInsightId(undefined as unknown as string)).toEqual({
      module: UNKNOWN_INSIGHT_KIND,
      kind: UNKNOWN_INSIGHT_KIND,
    });
  });
});
