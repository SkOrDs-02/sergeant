import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  serializeError: vi.fn((err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  })),
  redactKeyNames: [],
}));

const { enqueueMock, forgetSourceMock, getAiMemoryMock } = vi.hoisted(() => ({
  // Запис іде через чергу інжесту, не прямим `service.remember()` — див.
  // коментар у `profileMirror.ts` над `enqueueMemoryIngest`. Тому мок саме
  // на чергу: пін на `remember` пропустив би регрес «повернули синхронний
  // ембединг на інтерактивний шлях».
  enqueueMock: vi.fn<(input: unknown) => Promise<void>>(async () => {}),
  forgetSourceMock: vi.fn<
    (userId: string, source: string, sourceRef: string) => Promise<void>
  >(async () => {}),
  getAiMemoryMock: vi.fn(),
}));

vi.mock("./bootstrap.js", () => ({
  getAiMemory: getAiMemoryMock,
}));

vi.mock("./ingestQueue.js", () => ({
  enqueueMemoryIngest: enqueueMock,
}));

// rel-34-r2: згода читається лише для обліку стелі ембеддингів. Дефолт —
// обидві згоди є, тож решта тестів бачить ту саму поведінку, що й раніше.
const { aiConsentMock, healthConsentMock } = vi.hoisted(() => ({
  aiConsentMock: vi.fn<() => Promise<boolean>>(async () => true),
  healthConsentMock: vi.fn<() => Promise<boolean>>(async () => true),
}));

vi.mock("./consent.js", () => ({
  hasAiMemoryConsent: aiConsentMock,
  hasHealthDataConsent: healthConsentMock,
}));

import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";
import {
  PROFILE_MEMORY_CONTENT_MAX_LEN,
  PROFILE_MEMORY_MAX_ENTRIES,
  mirrorProfileMemoryEntries,
} from "./profileMirror.js";
import { __resetProfileEmbedCapState } from "./profileEmbedCap.js";
import type { RememberInput } from "./service.js";

const warnMock = logger.warn as unknown as ReturnType<typeof vi.fn>;

/**
 * Fake `Pool` для `mirrorProfileMemoryEntries`. SELECT іде через
 * `connect()` (RLS-контекст, `dbContext.ts`), тож клієнт відрізняє службові
 * BEGIN/COMMIT/set_config від справжнього запиту; `pool.query` — лише SELECT
 * по `ai_memories`, як і раніше бачили тести.
 */
function makeFakePool(
  existingRows: Array<{ source_ref: string | null; content: string }>,
) {
  const query = vi.fn().mockResolvedValue({ rows: existingRows });
  const client = {
    query: (sql: string, params?: unknown[]) =>
      /^\s*(BEGIN|COMMIT|ROLLBACK)\b|set_config\(/i.test(sql)
        ? Promise.resolve({ rows: [] })
        : query(sql, params),
    release: vi.fn(),
  };
  return {
    query,
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as import("pg").Pool;
}

const savedAiMemoryEnabled = env.AI_MEMORY_ENABLED;
const savedEmbedCap = env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP;

beforeEach(() => {
  env.AI_MEMORY_ENABLED = true;
  enqueueMock.mockClear();
  enqueueMock.mockImplementation(async () => {});
  forgetSourceMock.mockClear();
  forgetSourceMock.mockImplementation(async () => {});
  getAiMemoryMock.mockReset();
  getAiMemoryMock.mockReturnValue({
    remember: vi.fn(),
    forgetSource: forgetSourceMock,
  });
  warnMock.mockClear();
  aiConsentMock.mockReset();
  aiConsentMock.mockResolvedValue(true);
  healthConsentMock.mockReset();
  healthConsentMock.mockResolvedValue(true);
  __resetProfileEmbedCapState();
});

afterEach(() => {
  env.AI_MEMORY_ENABLED = savedAiMemoryEnabled;
  env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = savedEmbedCap;
});

function memoryBankProfile(
  entries: Array<{
    id: string;
    fact: string;
    category?: string;
    createdAt?: string;
  }>,
) {
  return { memoryBank: { entries, updatedAt: new Date().toISOString() } };
}

describe("profileMirror — extraction: memoryBank відсутній vs порожній", () => {
  it("профіль без ключа memoryBank — не читає БД і не чіпає ai_memories", async () => {
    const pool = makeFakePool([]);
    const result = await mirrorProfileMemoryEntries(pool, "user-1", {
      heightCm: 170,
    });
    expect(result).toEqual({
      ok: true,
      inserted: 0,
      updated: 0,
      deleted: 0,
      skippedInvalid: 0,
      skippedOverCap: 0,
      skippedUserCap: 0,
    });
    expect(pool.query).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(forgetSourceMock).not.toHaveBeenCalled();
  });

  it("memoryBank.entries: [] (справді порожній банк) видаляє всі наявні profile-рядки", async () => {
    const pool = makeFakePool([
      { source_ref: "fact-1", content: "алергія на горіхи" },
    ]);
    const result = await mirrorProfileMemoryEntries(
      pool,
      "user-1",
      memoryBankProfile([]),
    );
    expect(result.deleted).toBe(1);
    expect(forgetSourceMock).toHaveBeenCalledWith(
      "user-1",
      "profile",
      "fact-1",
    );
  });
});

describe("profileMirror — ідемпотентність (ПАСТКА 1)", () => {
  it("повторний пуш ІДЕНТИЧНОГО профілю не створює дублів і не викликає enqueue/forgetSource", async () => {
    const pool = makeFakePool([
      { source_ref: "fact-1", content: "алергія на горіхи" },
    ]);
    const result = await mirrorProfileMemoryEntries(
      pool,
      "user-1",
      memoryBankProfile([
        { id: "fact-1", fact: "алергія на горіхи", category: "allergy" },
      ]),
    );
    expect(result).toMatchObject({
      ok: true,
      inserted: 0,
      updated: 0,
      deleted: 0,
    });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(forgetSourceMock).not.toHaveBeenCalled();
  });
});

describe("profileMirror — оновлення (текст факту змінився)", () => {
  it("змінений текст факту видаляє стару embedding-версію й записує нову", async () => {
    const pool = makeFakePool([
      { source_ref: "fact-1", content: "алергія на горіхи" },
    ]);
    const result = await mirrorProfileMemoryEntries(
      pool,
      "user-1",
      memoryBankProfile([
        {
          id: "fact-1",
          fact: "алергія на горіхи і на молоко",
          category: "allergy",
        },
      ]),
    );
    expect(result).toMatchObject({
      ok: true,
      inserted: 0,
      updated: 1,
      deleted: 0,
    });
    expect(forgetSourceMock).toHaveBeenCalledWith(
      "user-1",
      "profile",
      "fact-1",
    );
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const writeArg = enqueueMock.mock.calls.map(
      (call) => call[0],
    ) as RememberInput[];
    expect(writeArg).toHaveLength(1);
    expect(writeArg[0]).toMatchObject({
      userId: "user-1",
      source: "profile",
      sourceRef: "fact-1",
      content: "алергія на горіхи і на молоко",
      metadata: { category: "allergy" },
    });
  });
});

describe("profileMirror — забутий факт видаляється", () => {
  it("source_ref, якого немає серед вхідних entries, викликає forgetSource", async () => {
    const pool = makeFakePool([
      { source_ref: "fact-1", content: "алергія на горіхи" },
      { source_ref: "fact-2", content: "тренується 3 рази на тиждень" },
    ]);
    const result = await mirrorProfileMemoryEntries(
      pool,
      "user-1",
      memoryBankProfile([
        {
          id: "fact-2",
          fact: "тренується 3 рази на тиждень",
          category: "training",
        },
      ]),
    );
    expect(result).toMatchObject({
      ok: true,
      inserted: 0,
      updated: 0,
      deleted: 1,
    });
    expect(forgetSourceMock).toHaveBeenCalledTimes(1);
    expect(forgetSourceMock).toHaveBeenCalledWith(
      "user-1",
      "profile",
      "fact-1",
    );
  });
});

describe("profileMirror — вставка нового факту", () => {
  it("новий id (не серед наявних source_ref) іде в чергу інжесту як insert", async () => {
    const pool = makeFakePool([]);
    const result = await mirrorProfileMemoryEntries(
      pool,
      "user-1",
      memoryBankProfile([{ id: "fact-9", fact: "любить каву без цукру" }]),
    );
    expect(result).toMatchObject({
      ok: true,
      inserted: 1,
      updated: 0,
      deleted: 0,
    });
    expect(forgetSourceMock).not.toHaveBeenCalled();
    const writeArg = enqueueMock.mock.calls.map(
      (call) => call[0],
    ) as RememberInput[];
    expect(writeArg[0]?.metadata).toEqual({ category: "other" });
  });
});

describe("profileMirror — healthData для health-категорій (priv-06)", () => {
  const healthDataOf = async (category: string, fact: string) => {
    enqueueMock.mockClear();
    await mirrorProfileMemoryEntries(
      makeFakePool([]),
      "user-1",
      memoryBankProfile([{ id: `f-${category}`, fact, category }]),
    );
    const arg = enqueueMock.mock.calls[0]?.[0] as { healthData?: boolean };
    return arg?.healthData;
  };

  it.each([
    ["health", "гіпертонія"],
    ["allergy", "алергія на арахіс"],
    ["diet", "вегетаріанка, 1800 ккал"],
    ["training", "жим 100 кг"],
    ["goal", "схуднути до 70 кг"],
  ])("%s → healthData: true", async (category, fact) => {
    expect(await healthDataOf(category, fact)).toBe(true);
  });

  it.each([
    ["preference", "любить каву"],
    ["other", "живе в Києві"],
    ["goal", "накопичити на відпустку"],
  ])("%s без health-змісту → healthData: false", async (category, fact) => {
    expect(await healthDataOf(category, fact)).toBe(false);
  });
});

describe("profileMirror — вимкнена фіча (AI_MEMORY_ENABLED=false)", () => {
  it("не читає БД і не кладе нічого в чергу", async () => {
    env.AI_MEMORY_ENABLED = false;
    const pool = makeFakePool([]);
    const result = await mirrorProfileMemoryEntries(
      pool,
      "user-1",
      memoryBankProfile([{ id: "fact-1", fact: "будь-що" }]),
    );
    expect(result).toEqual({
      ok: true,
      inserted: 0,
      updated: 0,
      deleted: 0,
      skippedInvalid: 0,
      skippedOverCap: 0,
      skippedUserCap: 0,
    });
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("profileMirror — ніколи не кидає (ПАСТКА 4)", () => {
  it("enqueueMemoryIngest кидає → mirrorProfileMemoryEntries резолвиться з ok:false, не throw", async () => {
    enqueueMock.mockRejectedValueOnce(new Error("circuit_open: voyage"));
    const pool = makeFakePool([]);
    await expect(
      mirrorProfileMemoryEntries(
        pool,
        "user-1",
        memoryBankProfile([{ id: "fact-1", fact: "будь-що" }]),
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "ai_memory_profile_mirror_failed" }),
    );
  });

  it("service.forgetSource() кидає → mirrorProfileMemoryEntries резолвиться з ok:false, не throw", async () => {
    forgetSourceMock.mockRejectedValueOnce(new Error("pg connection reset"));
    const pool = makeFakePool([
      { source_ref: "fact-1", content: "старий факт" },
    ]);
    await expect(
      mirrorProfileMemoryEntries(pool, "user-1", memoryBankProfile([])),
    ).resolves.toMatchObject({ ok: false });
  });

  it("успішний енкʼю нового факту → ok:true і рівно один виклик черги", async () => {
    // Раніше цей тест називався «consent вимкнений (remember() no-op-ить)»
    // і був неправдою після переходу на чергу: консент перевіряє
    // `service.remember()`, а він тепер виконується у ВОРКЕРІ, за межами
    // цього шляху. Дзеркалення про консент нічого не знає й знати не
    // мусить — воно лише кладе роботу в чергу. Тест і перевіряє рівно це.
    enqueueMock.mockImplementationOnce(async () => {});
    const pool = makeFakePool([]);
    const result = await mirrorProfileMemoryEntries(
      pool,
      "user-1",
      memoryBankProfile([{ id: "fact-1", fact: "будь-що" }]),
    );
    expect(result.ok).toBe(true);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe("profileMirror — захисна валідація (ПАСТКА 3)", () => {
  it("відкидає елементи без валідного id/fact, не кидає", async () => {
    const pool = makeFakePool([]);
    const result = await mirrorProfileMemoryEntries(pool, "user-1", {
      memoryBank: {
        entries: [
          { id: "ok-1", fact: "валідний факт" },
          { id: "", fact: "порожній id" },
          { id: "no-fact" },
          "рядок замість обʼєкта",
          42,
          null,
          { id: "ok-2", fact: "   " },
        ],
        updatedAt: new Date().toISOString(),
      },
    });
    expect(result.skippedInvalid).toBe(6);
    expect(result.inserted).toBe(1);
  });

  it("truncate-ить занадто довгий fact до PROFILE_MEMORY_CONTENT_MAX_LEN", async () => {
    const longFact = "a".repeat(PROFILE_MEMORY_CONTENT_MAX_LEN + 50);
    const pool = makeFakePool([]);
    await mirrorProfileMemoryEntries(
      pool,
      "user-1",
      memoryBankProfile([{ id: "fact-1", fact: longFact }]),
    );
    const writeArg = enqueueMock.mock.calls.map(
      (call) => call[0],
    ) as RememberInput[];
    expect(writeArg[0]?.content.length).toBe(PROFILE_MEMORY_CONTENT_MAX_LEN);
  });

  it("рубає кількість записів до PROFILE_MEMORY_MAX_ENTRIES, лишає найновіші", async () => {
    // Добова стеля користувача (rel-34) тут ні до чого — піднімаємо її.
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = PROFILE_MEMORY_MAX_ENTRIES * 2;
    const entries = Array.from(
      { length: PROFILE_MEMORY_MAX_ENTRIES + 10 },
      (_, i) => ({
        id: `fact-${i}`,
        fact: `факт номер ${i}`,
        createdAt: new Date(2026, 0, 1 + i).toISOString(),
      }),
    );
    const pool = makeFakePool([]);
    const result = await mirrorProfileMemoryEntries(
      pool,
      "user-1",
      memoryBankProfile(entries),
    );
    expect(result.skippedOverCap).toBe(10);
    expect(result.inserted).toBe(PROFILE_MEMORY_MAX_ENTRIES);
    const writeArg = enqueueMock.mock.calls.map(
      (call) => call[0],
    ) as RememberInput[];
    // Найновіші (найбільший індекс → найпізніша дата) мають лишитись.
    const keptIds = new Set(writeArg.map((w) => w.sourceRef));
    expect(keptIds.has(`fact-${PROFILE_MEMORY_MAX_ENTRIES + 9}`)).toBe(true);
    expect(keptIds.has("fact-0")).toBe(false);
  });
});

describe("profileMirror — jobId черги мусить розрізняти ЗМІСТ, не лише id", () => {
  // Знайдено security-ревʼю дифу (2026-08-09), і це найтихіший баг цього PR.
  //
  // `buildJobId` у `ingestQueue.ts` — це `(userId, source, sourceRef)`. Для
  // `profile` `sourceRef` = локальний id факту, який ПЕРЕЖИВАЄ редагування
  // тексту. Тож оновлення факту йшло так: `forgetSource` hard-видаляє рядок,
  // далі enqueue з тим самим jobId — і BullMQ мовчки його відкидає, поки
  // попередній job тримається в Redis (`removeOnComplete: 24h`).
  // Факт зникав із RAG, лишаючись на екрані.
  //
  // Відтворити це через сам BullMQ тут не можна — без Redis черга падає в
  // `runDirectDispatch`, де дедупу немає взагалі (саме тому баг був
  // прод-only і не зʼявився б ані локально, ані в CI). Тому пінимо ВХІД, від
  // якого дедуп залежить: різний текст того самого факту мусить дати різну
  // сіль, однаковий — однакову.
  async function saltFor(fact: string): Promise<string | undefined> {
    enqueueMock.mockClear();
    const pool = makeFakePool([]);
    await mirrorProfileMemoryEntries(
      pool,
      "user-1",
      memoryBankProfile([{ id: "fact-1", fact }]),
    );
    const payload = enqueueMock.mock.calls[0]?.[0] as
      { dedupeSalt?: string } | undefined;
    return payload?.dedupeSalt;
  }

  it("змінений текст того самого факту дає ІНШУ сіль — job не буде дедуплікований", async () => {
    const before = await saltFor("алергія на горіхи");
    const after = await saltFor("алергія на горіхи і на молоко");
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  it("незмінений текст дає ТУ САМУ сіль — справжня ідемпотентність збережена", async () => {
    const first = await saltFor("тренується 3 рази на тиждень");
    const second = await saltFor("тренується 3 рази на тиждень");
    expect(first).toBe(second);
  });
});

describe("profileMirror — добова стеля ембеддингів на користувача (rel-34)", () => {
  function facts(prefix: string, n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `fact-${i}`,
      fact: `${prefix} ${i}`,
    }));
  }

  it("скрипт, що щоразу міняє текст фактів, упирається в стелю; решта тихо пропускається", async () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 5;
    const first = await mirrorProfileMemoryEntries(
      makeFakePool([]),
      "user-1",
      memoryBankProfile(facts("версія 1", 3)),
    );
    expect(first).toMatchObject({ ok: true, inserted: 3, skippedUserCap: 0 });

    // Другий PUT: ті самі id, новий текст — кожен факт просить новий embed.
    const second = await mirrorProfileMemoryEntries(
      makeFakePool(
        facts("версія 1", 3).map((f) => ({
          source_ref: f.id,
          content: f.fact,
        })),
      ),
      "user-1",
      memoryBankProfile(facts("версія 2", 3)),
    );
    expect(second).toMatchObject({ ok: true, updated: 2, skippedUserCap: 1 });
    expect(enqueueMock).toHaveBeenCalledTimes(5);
    // Пропущене оновлення НЕ видаляє стару версію: застарілий текст кращий
    // за зниклий факт.
    expect(forgetSourceMock).toHaveBeenCalledTimes(2);
    expect(forgetSourceMock).not.toHaveBeenCalledWith(
      "user-1",
      "profile",
      "fact-2",
    );
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "ai_memory_profile_embed_user_cap",
        userId: "user-1",
        skipped: 1,
        cap: 5,
      }),
    );
    // Hard Rule #21: у лозі немає тексту фактів.
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain("версія");
  });

  it("стеля per-user: вичерпана в одного не зачіпає іншого", async () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 2;
    const a = await mirrorProfileMemoryEntries(
      makeFakePool([]),
      "user-a",
      memoryBankProfile(facts("факт", 4)),
    );
    const b = await mirrorProfileMemoryEntries(
      makeFakePool([]),
      "user-b",
      memoryBankProfile(facts("факт", 2)),
    );
    expect(a).toMatchObject({ inserted: 2, skippedUserCap: 2 });
    expect(b).toMatchObject({ inserted: 2, skippedUserCap: 0 });
  });

  it("видалення фактів стелею не гейтиться", async () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 1;
    await mirrorProfileMemoryEntries(
      makeFakePool([]),
      "user-1",
      memoryBankProfile(facts("факт", 1)),
    );
    const result = await mirrorProfileMemoryEntries(
      makeFakePool([{ source_ref: "old", content: "старий факт" }]),
      "user-1",
      memoryBankProfile([]),
    );
    expect(result).toMatchObject({ ok: true, deleted: 1 });
    expect(forgetSourceMock).toHaveBeenCalledWith("user-1", "profile", "old");
  });
});

describe("profileMirror — стеля списує лише те, що дійде до Voyage (rel-34-r2)", () => {
  const rows = (facts: Array<{ id: string; fact: string }>) =>
    facts.map((f) => ({ source_ref: f.id, content: f.fact }));

  it("health-факти без healthDataConsent не зʼїдають стелю справжнім фактам", async () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 2;
    healthConsentMock.mockResolvedValue(false);
    const health = [1, 2, 3].map((i) => ({
      id: `h-${i}`,
      fact: `алергія ${i}`,
      category: "allergy",
    }));
    const a = { id: "a", fact: "любить каву" };
    const first = await mirrorProfileMemoryEntries(
      makeFakePool([]),
      "user-1",
      memoryBankProfile([...health, a]),
    );
    // Health-факти однаково йдуть у чергу (там їх відсіче згода), але
    // одиниць стелі не беруть.
    expect(first).toMatchObject({ ok: true, inserted: 4, skippedUserCap: 0 });

    // Наступний PUT: health-факти так і лишились незаписаними (згоди
    // немає), «a» записаний, додано «b» — він мусить пройти.
    const b = { id: "b", fact: "бігає зранку" };
    const second = await mirrorProfileMemoryEntries(
      makeFakePool(rows([a])),
      "user-1",
      memoryBankProfile([...health, a, b]),
    );
    expect(second).toMatchObject({ ok: true, inserted: 4, skippedUserCap: 0 });
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRef: "b" }),
    );
  });

  it("без згоди ai_memory нічого не списується; після її появи стеля ціла", async () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 2;
    aiConsentMock.mockResolvedValue(false);
    const facts = [1, 2, 3].map((i) => ({ id: `f-${i}`, fact: `факт ${i}` }));
    for (let i = 0; i < 3; i += 1) {
      const result = await mirrorProfileMemoryEntries(
        makeFakePool([]),
        "user-1",
        memoryBankProfile(facts),
      );
      expect(result.skippedUserCap).toBe(0);
    }
    expect(healthConsentMock).not.toHaveBeenCalled();

    aiConsentMock.mockResolvedValue(true);
    const after = await mirrorProfileMemoryEntries(
      makeFakePool([]),
      "user-1",
      memoryBankProfile(facts),
    );
    expect(after).toMatchObject({ inserted: 2, skippedUserCap: 1 });
  });

  it("факт у черзі, ще не записаний, повторно не списується", async () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 2;
    const x = { id: "x", fact: "факт x" };
    const y = { id: "y", fact: "факт y" };
    await mirrorProfileMemoryEntries(
      makeFakePool([]),
      "user-1",
      memoryBankProfile([x, y]),
    );
    // Черга ще не дійшла: ai_memories порожня, ті самі факти знову «нові».
    const again = await mirrorProfileMemoryEntries(
      makeFakePool([]),
      "user-1",
      memoryBankProfile([x, y]),
    );
    expect(again).toMatchObject({ inserted: 2, skippedUserCap: 0 });

    // Стеля при цьому вичерпана чесно: новий факт уже не проходить.
    const z = { id: "z", fact: "факт z" };
    const third = await mirrorProfileMemoryEntries(
      makeFakePool(rows([x, y])),
      "user-1",
      memoryBankProfile([x, y, z]),
    );
    expect(third).toMatchObject({ inserted: 0, skippedUserCap: 1 });
  });

  it("чергування двох текстів одного факту списується щоразу", async () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 3;
    const v = (fact: string) => [{ id: "f", fact }];
    const results = [];
    let stored: Array<{ id: string; fact: string }> = [];
    for (const text of ["A", "B", "A", "B"]) {
      results.push(
        await mirrorProfileMemoryEntries(
          makeFakePool(rows(stored)),
          "user-1",
          memoryBankProfile(v(text)),
        ),
      );
      stored = v(text);
    }
    expect(results.map((r) => r.skippedUserCap)).toEqual([0, 0, 0, 1]);
  });

  it("збій перевірки згоди — списуємо (обережний бік для бюджету)", async () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 1;
    aiConsentMock.mockRejectedValue(new Error("pg down"));
    const result = await mirrorProfileMemoryEntries(
      makeFakePool([]),
      "user-1",
      memoryBankProfile([
        { id: "a", fact: "факт a" },
        { id: "b", fact: "факт b" },
      ]),
    );
    expect(result).toMatchObject({ ok: true, inserted: 1, skippedUserCap: 1 });
  });
});
