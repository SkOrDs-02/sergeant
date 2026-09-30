/**
 * Status: Active
 *
 * Гейт «дані про здоровʼя → модель» (`healthGate.ts`, `tools.ts`,
 * `promptCache.ts`). Тримає інваріант: без згоди health-частина контексту,
 * tools і tool_results до моделі не доходить; зі згодою — усе як було.
 */
import { describe, expect, it } from "vitest";
import { HEALTH_CONSENT_REQUIRED_MESSAGE } from "@sergeant/shared";
import {
  HEALTH_CONSENT_SYSTEM_NOTE,
  redactHealthToolCalls,
  redactHealthToolResults,
  stripHealthContext,
  stripHealthFromCoachInput,
} from "./healthGate.js";
import {
  HEALTH_ONLY_TOOL_NAMES,
  TOOLS,
  filterToolsByHealthConsent,
} from "./tools.js";
import {
  __resetToolsPayloadCache,
  buildSystem,
  buildToolsPayload,
} from "./promptCache.js";
import type { CoachMemory, CoachSnapshot } from "./coach.js";

// Рядки контексту дослівно як їх пише
// `apps/web/src/core/lib/hubChatContext/{finance,sections}.ts`.
const CONTEXT = [
  "[Баланс] 12 000 грн",
  "[Тренування] завершених всього: 12, цього тижня завершено: 2, за останні 7 днів сесій: 2, остання дата: 3 вер.",
  "[Фізрук тиждень] обʼєм кг×повт (Пн–Нд): 4 200",
  "[Фізрук загалом] сумарний обʼєм завершених: 90 000 кг×повт",
  "[Фізрук активне тренування] немає",
  "[Останнє тренування вправи] Присідання, Жим",
  "[Звички] виконано 3 з 5",
  "[Харчування сьогодні] 1800 ккал | білок: 90г | жири: 60г | вуглеводи: 200г | прийомів: 3",
  "[Харчування прийоми] Борщ (400 ккал)",
  "[Харчування ціль] 2200 ккал/день",
  "[Харчування тиждень] середньо 2000 ккал/день (за 5 днів)",
  "[Харчування поденні цілі] 2026-09-28: 2200",
  "[Активні рекомендації]",
  "  🏋️ Час на тренування: минуло 4 дні (модуль: fizruk)",
  "  🍽️ Додай обід (модуль: nutrition)",
  "  🔁 Відміть звичку (модуль: routine)",
  "[Аналітичні інсайти]",
  "  Найпродуктивніший день (Пн): 5 тренувань",
  "[Профіль користувача]",
  "  Алергії: горіхи",
  "  Здоровʼя: гіпертонія",
  "  Харчування: без глютену",
].join("\n");

describe("stripHealthContext", () => {
  const stripped = stripHealthContext(CONTEXT);

  it("прибирає тренування, харчування, інсайти, health-рекомендації й категорію профілю", () => {
    for (const leak of [
      "[Тренування]",
      "[Фізрук",
      "[Останнє тренування вправи]",
      "[Харчування",
      "модуль: fizruk",
      "модуль: nutrition",
      "[Аналітичні інсайти]",
      "Найпродуктивніший день",
      "гіпертонія",
      "1800 ккал",
      "Борщ",
    ]) {
      expect(stripped).not.toContain(leak);
    }
  });

  it("лишає фінанси, звички, рекомендації інших модулів і не-health профіль", () => {
    expect(stripped).toContain("[Баланс] 12 000 грн");
    expect(stripped).toContain("[Звички] виконано 3 з 5");
    expect(stripped).toContain("[Активні рекомендації]");
    expect(stripped).toContain("модуль: routine");
    expect(stripped).toContain("[Профіль користувача]");
    expect(stripped).toContain("Алергії: горіхи");
    expect(stripped).toContain("Харчування: без глютену");
  });

  it("секція інсайтів закінчується на першому не-відступному рядку", () => {
    const out = stripHealthContext(
      ["[Аналітичні інсайти]", "  a", "  b", "[Звички] так"].join("\n"),
    );
    expect(out).toBe("[Звички] так");
  });

  it("порожній контекст лишається порожнім", () => {
    expect(stripHealthContext("")).toBe("");
  });
});

describe("filterToolsByHealthConsent / buildToolsPayload", () => {
  const namesOf = (tools: readonly object[]) =>
    new Set(tools.map((t) => (t as { name: string }).name));

  it("зі згодою повертає той самий реєстр", () => {
    expect(filterToolsByHealthConsent(TOOLS, true)).toBe(TOOLS);
  });

  it("без згоди прибирає Фізрук, Харчування (крім комори/покупок) і weight_chart", () => {
    const kept = namesOf(filterToolsByHealthConsent(TOOLS, false));
    for (const name of [
      "log_weight",
      "log_meal",
      "query_workouts",
      "query_nutrition",
      "weight_chart",
      "set_goal",
    ]) {
      expect(kept.has(name)).toBe(false);
      expect(HEALTH_ONLY_TOOL_NAMES.has(name)).toBe(true);
    }
    for (const name of [
      "add_to_shopping_list",
      "consume_from_pantry",
      "clear_pantry",
      "query_transactions",
      "mark_habit_done",
      "morning_briefing",
      "get_daily_series",
    ]) {
      expect(kept.has(name)).toBe(true);
    }
  });

  it("payload для моделі не вкладає health-tools без згоди й не роздає кеш між станами", () => {
    __resetToolsPayloadCache();
    // Порядок навмисний: спершу «без згоди», щоб урізаний набір не
    // «прогрів» кеш для тих, хто згоду дав.
    const without = namesOf(
      buildToolsPayload("claude-sonnet-4-6", null, false),
    );
    const withConsent = namesOf(
      buildToolsPayload("claude-sonnet-4-6", null, true),
    );
    expect(JSON.stringify([...without])).not.toContain("log_weight");
    expect(withConsent.size).toBeGreaterThan(without.size);
  });
});

describe("buildSystem", () => {
  it("без згоди додає власний (не user_data) блок з інструкцією; зі згодою — ні", () => {
    const without = buildSystem("[Баланс] 1", undefined, false);
    const withConsent = buildSystem("[Баланс] 1", undefined, true);
    const texts = without.map((b) => b.text);
    expect(texts).toContain(HEALTH_CONSENT_SYSTEM_NOTE);
    expect(without.length).toBe(withConsent.length + 1);
    expect(withConsent.map((b) => b.text)).not.toContain(
      HEALTH_CONSENT_SYSTEM_NOTE,
    );
    // Cached-префікс той самий: зміна лише після breakpoint-а.
    expect(without[0]).toEqual(withConsent[0]);
  });

  it("інструкція називає, де ввімкнути згоду", () => {
    expect(HEALTH_CONSENT_SYSTEM_NOTE).toContain("Дані та приватність");
  });
});

describe("redactHealthToolResults / redactHealthToolCalls", () => {
  const calls = [
    { type: "tool_use", id: "t1", name: "log_meal", input: { name: "Борщ" } },
    {
      type: "tool_use",
      id: "t2",
      name: "query_transactions",
      input: { limit: 3 },
    },
    {
      type: "tool_use",
      id: "t3",
      name: "get_daily_series",
      input: { metrics: ["spending", "weight"] },
    },
    {
      type: "tool_use",
      id: "t4",
      name: "get_daily_series",
      input: { metrics: ["spending", "income"] },
    },
    { type: "tool_use", id: "t5", name: "compare_weeks", input: {} },
    {
      type: "tool_use",
      id: "t6",
      name: "compare_weeks",
      input: { modules: ["finyk", "routine"] },
    },
    { type: "tool_use", id: "t7", name: "morning_briefing", input: {} },
    { type: "tool_use", id: "t8", name: "my_profile", input: {} },
    {
      type: "tool_use",
      id: "t9",
      name: "export_module_data",
      input: { module: "fizruk" },
    },
    {
      type: "tool_use",
      id: "t10",
      name: "remember",
      input: { fact: "тиск 140", category: "health" },
    },
    {
      type: "tool_use",
      id: "t11",
      name: "habit_correlation",
      input: { against: "workouts" },
    },
  ];
  const results = [
    { tool_use_id: "t1", content: "Додано: Борщ 400 ккал" },
    { tool_use_id: "t2", content: "3 транзакції" },
    { tool_use_id: "t3", content: "вага корелює з витратами" },
    { tool_use_id: "t4", content: "витрати vs доходи" },
    { tool_use_id: "t5", content: "Фізрук: 3 тренування" },
    { tool_use_id: "t6", content: "Фінік: 100 грн" },
    {
      tool_use_id: "t7",
      content: [
        "Доброго ранку! Сьогодні понеділок",
        "Звички: 2/5 виконано",
        "Заплановано тренувань: 1",
        "Калорії: 1 800 ккал",
      ].join("\n"),
    },
    {
      tool_use_id: "t8",
      content: [
        "Профіль користувача (2):",
        "  - [Алергії] горіхи (id:a)",
        "  - [Здоровʼя] гіпертонія (id:b)",
      ].join("\n"),
    },
    { tool_use_id: "t9", content: "Експорт Фізрук: ..." },
    { tool_use_id: "t10", content: "Запамʼятав: тиск 140 (Здоровʼя, id:x)" },
    { tool_use_id: "t11", content: "у дні тренувань частіше" },
  ];

  const out = redactHealthToolResults(results, calls);
  const byId = new Map(out.map((r) => [r.tool_use_id, r.content]));

  it("health-only і health-параметризовані результати замінюються текстом-дією", () => {
    for (const id of ["t1", "t3", "t5", "t9", "t10", "t11"]) {
      expect(byId.get(id)).toBe(HEALTH_CONSENT_REQUIRED_MESSAGE);
    }
  });

  it("не-health результати лишаються дослівно", () => {
    expect(byId.get("t2")).toBe("3 транзакції");
    expect(byId.get("t4")).toBe("витрати vs доходи");
    expect(byId.get("t6")).toBe("Фінік: 100 грн");
  });

  it("змішані результати гублять лише health-рядки", () => {
    const briefing = String(byId.get("t7"));
    expect(briefing).toContain("Звички: 2/5 виконано");
    expect(briefing).not.toContain("тренувань");
    expect(briefing).not.toContain("Калорії");
    const profile = String(byId.get("t8"));
    expect(profile).toContain("горіхи");
    expect(profile).not.toContain("гіпертонія");
  });

  it("вхід не мутується", () => {
    expect(results[0]?.content).toBe("Додано: Борщ 400 ккал");
  });

  it("аргументи health tool_use обнуляються у відтвореній історії", () => {
    const redacted = redactHealthToolCalls(calls) as Array<{
      id: string;
      input: unknown;
    }>;
    const inputOf = (id: string) => redacted.find((b) => b.id === id)?.input;
    expect(inputOf("t1")).toEqual({});
    expect(inputOf("t10")).toEqual({});
    expect(inputOf("t2")).toEqual({ limit: 3 });
    expect(inputOf("t4")).toEqual({ metrics: ["spending", "income"] });
  });
});

describe("stripHealthFromCoachInput", () => {
  const snapshot: CoachSnapshot = {
    finyk: { totalSpent: 100 },
    fizruk: { workoutsCount: 3 },
    nutrition: { avgKcal: 2000 },
    routine: { overallRate: 80 },
  };
  const memory: CoachMemory = {
    lastInsightDate: null,
    lastInsightText: null,
    weeklyDigests: [
      {
        weekKey: "2026-W38",
        generatedAt: "2026-09-21T00:00:00Z",
        finyk: { summary: "фінанси" },
        fizruk: { summary: "тренування" },
        nutrition: { summary: "їжа" },
        routine: { summary: "звички" },
        correlations: ["у дні тренувань витрачаєш менше"],
        overallRecommendations: ["спи більше"],
      },
    ],
  };

  it("знімок і памʼять без Фізрука/Харчування/кореляцій; решта на місці", () => {
    const out = stripHealthFromCoachInput({ snapshot, memory });
    expect(out.snapshot).toEqual({
      finyk: { totalSpent: 100 },
      routine: { overallRate: 80 },
    });
    const d = out.memory?.weeklyDigests[0];
    expect(d?.fizruk).toBeNull();
    expect(d?.nutrition).toBeNull();
    expect(d?.correlations).toEqual([]);
    expect(d?.finyk?.summary).toBe("фінанси");
    expect(d?.routine?.summary).toBe("звички");
    // вхід не мутовано
    expect(snapshot.fizruk).toBeDefined();
    expect(memory.weeklyDigests[0]?.fizruk?.summary).toBe("тренування");
  });

  it("null-памʼять лишається null", () => {
    expect(
      stripHealthFromCoachInput({ snapshot, memory: null }).memory,
    ).toBeNull();
  });
});
