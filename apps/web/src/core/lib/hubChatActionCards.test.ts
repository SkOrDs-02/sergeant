// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  buildActionCard,
  isDataResultTool,
  isRiskyTool,
} from "./hubChatActionCards";

describe("buildActionCard", () => {
  it("повертає картку для основного tool-а (create_transaction)", () => {
    const card = buildActionCard({
      name: "create_transaction",
      input: { amount: 120, description: "кава" },
      result: "Витрату 120 ₴ записано",
    });
    expect(card).not.toBeNull();
    expect(card?.toolName).toBe("create_transaction");
    expect(card?.status).toBe("completed");
    expect(card?.module).toBe("finyk");
    expect(card?.title).toContain("Транзакцію");
    expect(card?.summary).toContain("120");
    expect(card?.summary).toContain("кава");
  });

  it("повертає null для невідомого tool-а", () => {
    const card = buildActionCard({
      name: "some_internal_lookup",
      input: {},
      result: "ok",
    });
    expect(card).toBeNull();
  });

  it("позначає failed коли result починається з «Помилка»", () => {
    const card = buildActionCard({
      name: "log_set",
      input: { exercise: "жим", weight_kg: 80, reps: 8 },
      result: "Помилка виконання: щось зламалося",
    });
    expect(card?.status).toBe("failed");
    expect(card?.title).toMatch(/не вийшло/);
  });

  it("title для morning_briefing/weekly_summary містить failedSuffix при failed", () => {
    const morning = buildActionCard({
      name: "morning_briefing",
      input: {},
      result: "Помилка виконання: timeout",
    });
    expect(morning?.status).toBe("failed");
    expect(morning?.title).toMatch(/не вийшло/);

    const weekly = buildActionCard({
      name: "weekly_summary",
      input: {},
      result: "Помилка виконання: timeout",
    });
    expect(weekly?.status).toBe("failed");
    expect(weekly?.title).toMatch(/не вийшло/);
  });

  it("позначає failed коли result починається з «Невідома дія»", () => {
    const card = buildActionCard({
      name: "log_meal",
      input: {},
      result: "Невідома дія: log_meal",
    });
    expect(card?.status).toBe("failed");
  });

  it("приймає explicit failed=true навіть якщо текст ок", () => {
    const card = buildActionCard({
      name: "log_water",
      input: { amount_ml: 250 },
      result: "ok",
      failed: true,
    });
    expect(card?.status).toBe("failed");
  });

  it("витягує summary для log_set з input полів", () => {
    const card = buildActionCard({
      name: "log_set",
      input: { exercise: "жим лежачи", weight_kg: 80, reps: 8 },
      result: "Підхід додано",
    });
    expect(card?.summary).toContain("жим лежачи");
    expect(card?.summary).toContain("80");
    expect(card?.summary).toContain("8");
  });

  it("витягує summary для log_meal", () => {
    const card = buildActionCard({
      name: "log_meal",
      input: { meal_type: "сніданок", description: "вівсянка", calories: 350 },
      result: "Залоговано",
    });
    expect(card?.summary).toContain("сніданок");
    expect(card?.summary).toContain("вівсянка");
    expect(card?.summary).toContain("350");
  });

  it("витягує summary для log_water", () => {
    const card = buildActionCard({
      name: "log_water",
      input: { amount_ml: 500 },
      result: "ok",
    });
    expect(card?.summary).toBe("500 мл");
  });

  it("ставить module=finyk для create_transaction", () => {
    const card = buildActionCard({
      name: "create_transaction",
      input: {},
      result: "ok",
    });
    expect(card?.module).toBe("finyk");
  });

  it("будує картку для find_transaction", () => {
    const card = buildActionCard({
      name: "find_transaction",
      input: { query: "АТБ", amount: 450 },
      result: "Знайдено 1 транзакц.",
    });
    expect(card?.module).toBe("finyk");
    expect(card?.title).toContain("знайдено");
    expect(card?.summary).toContain("АТБ");
    expect(card?.summary).toContain("450");
    expect(card?.risky).toBeUndefined();
  });

  it("будує risky картку для batch_categorize", () => {
    const card = buildActionCard({
      name: "batch_categorize",
      input: { pattern: "Сільпо", category_id: "food" },
      result: "Категорію 2 транзакц. змінено на food",
    });
    expect(card?.module).toBe("finyk");
    expect(card?.title).toContain("Категорії");
    expect(card?.summary).toContain("Сільпо");
    expect(card?.summary).toContain("food");
    expect(card?.risky).toBe(true);
  });

  it("ставить module=fizruk для log_set", () => {
    const card = buildActionCard({
      name: "log_set",
      input: {},
      result: "ok",
    });
    expect(card?.module).toBe("fizruk");
  });

  it("ставить module=routine для mark_habit_done", () => {
    const card = buildActionCard({
      name: "mark_habit_done",
      input: { habit_id: "вода" },
      result: "ok",
    });
    expect(card?.module).toBe("routine");
    expect(card?.summary).toBe("вода");
  });

  it("ставить module=nutrition для log_meal", () => {
    const card = buildActionCard({
      name: "log_meal",
      input: {},
      result: "ok",
    });
    expect(card?.module).toBe("nutrition");
  });

  it("ставить module=hub для morning_briefing", () => {
    const card = buildActionCard({
      name: "morning_briefing",
      input: {},
      result: "ok",
    });
    expect(card?.module).toBe("hub");
    expect(card?.title).toContain("брифінг");
  });

  it("картка для morning_briefing і weekly_summary не risky", () => {
    const briefing = buildActionCard({
      name: "morning_briefing",
      input: {},
      result: "ok",
    });
    const summary = buildActionCard({
      name: "weekly_summary",
      input: {},
      result: "ok",
    });
    expect(briefing?.risky).toBeUndefined();
    expect(summary?.risky).toBeUndefined();
  });

  it("будує картку для set_habit_schedule (routine, calendar, не risky)", () => {
    const card = buildActionCard({
      name: "set_habit_schedule",
      input: { habit_id: "h1", days: ["mon", "wed", "fri"] },
      result: 'Розклад звички "Тренування" — Пн, Ср, Пт',
    });
    expect(card?.module).toBe("routine");
    expect(card?.icon).toBe("calendar");
    expect(card?.title).toBe("Розклад звички оновлено");
    expect(card?.summary).toBe("mon, wed, fri");
    expect(card?.risky).toBeUndefined();
  });

  it("set_habit_schedule failed — суфікс «не вийшло» у title", () => {
    const card = buildActionCard({
      name: "set_habit_schedule",
      input: { habit_id: "h1", days: ["foo"] },
      result: "Помилка: невідомі дні",
    });
    expect(card?.status).toBe("failed");
    expect(card?.title).toMatch(/не вийшло/);
  });

  it("будує картку для pause_habit (routine, pause-circle, не risky)", () => {
    const card = buildActionCard({
      name: "pause_habit",
      input: { habit_id: "h1" },
      result: 'Звичку "Біг" поставлено на паузу.',
    });
    expect(card?.module).toBe("routine");
    expect(card?.icon).toBe("pause-circle");
    expect(card?.title).toBe("Стан паузи звички оновлено");
    expect(card?.summary).toContain("h1");
    expect(card?.summary).toContain("на паузі");
    expect(card?.risky).toBeUndefined();
  });

  it("pause_habit з paused=false показує «знято з паузи» у summary", () => {
    const card = buildActionCard({
      name: "pause_habit",
      input: { habit_id: "h1", paused: false },
      result: 'Звичку "Біг" знято з паузи.',
    });
    expect(card?.summary).toContain("знято з паузи");
  });

  it("pause_habit failed — статус failed і суфікс у title", () => {
    const card = buildActionCard({
      name: "pause_habit",
      input: { habit_id: "" },
      result: "Помилка: потрібен habit_id",
    });
    expect(card?.status).toBe("failed");
    expect(card?.title).toMatch(/не вийшло/);
  });

  it("кожна картка має непустий id, title і summary", () => {
    const card = buildActionCard({
      name: "create_habit",
      input: { name: "Пити воду" },
      result: "ok",
    });
    expect(card?.id).toMatch(/^card_/);
    expect(card?.title.length).toBeGreaterThan(0);
    expect(card?.summary.length).toBeGreaterThan(0);
  });

  describe("compare_weeks", () => {
    it("картка з обома тижнями у summary", () => {
      const card = buildActionCard({
        name: "compare_weeks",
        input: { week_a: "2026-W17", week_b: "2026-W16" },
        result: "Порівняння тижнів: 20 квіт – 26 квіт vs 13 квіт – 19 квіт",
      });
      expect(card).not.toBeNull();
      expect(card?.module).toBe("hub");
      expect(card?.title).toBe("Порівняння тижнів");
      expect(card?.summary).toBe("2026-W17 vs 2026-W16");
      expect(card?.icon).toBe("bar-chart");
      expect(card?.risky).toBeUndefined();
    });

    it("без аргументів — fallback summary 'поточний vs попередній'", () => {
      const card = buildActionCard({
        name: "compare_weeks",
        input: {},
        result: "Порівняння тижнів: … vs …",
      });
      expect(card?.summary).toBe("поточний vs попередній");
    });

    it("failed — title із суфіксом «не вийшло»", () => {
      const card = buildActionCard({
        name: "compare_weeks",
        input: { week_a: "2026-W17" },
        result: 'Некоректний week_a: "bad". Очікую YYYY-Www.',
      });
      expect(card?.status).toBe("completed");
      const failed = buildActionCard({
        name: "compare_weeks",
        input: {},
        result: "Помилка виконання: timeout",
      });
      expect(failed?.status).toBe("failed");
      expect(failed?.title).toBe("Порівняння тижнів — не вийшло");
    });
  });
});

describe("query / analytics tools (talk-to-your-data PR4)", () => {
  const QUERY_TOOLS = [
    "query_transactions",
    "aggregate_spending",
    "compare_periods",
    "query_workouts",
    "exercise_progress",
    "training_stats",
    "query_habits",
    "habit_correlation",
    "query_nutrition",
    "nutrition_averages",
  ] as const;

  it("будує картку з data=true для кожного query-tool-а", () => {
    for (const name of QUERY_TOOLS) {
      const card = buildActionCard({
        name,
        input: {},
        result: "Якийсь числовий результат",
      });
      expect(card, name).not.toBeNull();
      expect(card?.data, name).toBe(true);
      expect(card?.risky, name).toBeUndefined();
      expect(card?.title.length, name).toBeGreaterThan(0);
      // summary keeps the full result untruncated for DataResultCard.
      expect(card?.summary, name).toBe("Якийсь числовий результат");
    }
  });

  it("isDataResultTool розпізнає лише query-tool-и", () => {
    for (const name of QUERY_TOOLS) {
      expect(isDataResultTool(name), name).toBe(true);
    }
    expect(isDataResultTool("create_transaction")).toBe(false);
    expect(isDataResultTool("morning_briefing")).toBe(false);
    expect(isDataResultTool("log_meal")).toBe(false);
  });

  it("мапить query-tool-и на доменні модулі", () => {
    expect(
      buildActionCard({ name: "query_transactions", input: {}, result: "ok" })
        ?.module,
    ).toBe("finyk");
    expect(
      buildActionCard({ name: "query_workouts", input: {}, result: "ok" })
        ?.module,
    ).toBe("fizruk");
    expect(
      buildActionCard({ name: "query_habits", input: {}, result: "ok" })
        ?.module,
    ).toBe("routine");
    expect(
      buildActionCard({ name: "query_nutrition", input: {}, result: "ok" })
        ?.module,
    ).toBe("nutrition");
  });

  it("query-картка не truncate-иться навіть для довгого результату", () => {
    const long = "Знайдено 50 транзакц. ".repeat(20).trim();
    const card = buildActionCard({
      name: "query_transactions",
      input: {},
      result: long,
    });
    expect(card?.summary).toBe(long);
    expect(card?.summary.length).toBeGreaterThan(120);
  });

  it("failed query-tool — суфікс «не вийшло» у title, data лишається true", () => {
    const card = buildActionCard({
      name: "aggregate_spending",
      input: {},
      result: "Помилка: немає даних",
    });
    expect(card?.status).toBe("failed");
    expect(card?.title).toMatch(/не вийшло/);
    expect(card?.data).toBe(true);
  });
});

describe("isRiskyTool", () => {
  it("розпізнає risky tools", () => {
    expect(isRiskyTool("batch_categorize")).toBe(true);
    expect(isRiskyTool("delete_transaction")).toBe(true);
    expect(isRiskyTool("hide_transaction")).toBe(true);
    expect(isRiskyTool("forget")).toBe(true);
    expect(isRiskyTool("archive_habit")).toBe(true);
    expect(isRiskyTool("import_monobank_range")).toBe(true);
  });

  it("звичайні tools — не risky", () => {
    expect(isRiskyTool("create_transaction")).toBe(false);
    expect(isRiskyTool("log_meal")).toBe(false);
    expect(isRiskyTool("morning_briefing")).toBe(false);
  });
});
