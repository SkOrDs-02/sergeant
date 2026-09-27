import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

const sendToUserQuietly = vi.hoisted(() => vi.fn());
vi.mock("../../push/send.js", () => ({ sendToUserQuietly }));

const { pruneReminderLog, runReminderSweep } = await import("./sweep.js");

/**
 * 2026-08-03 (понеділок) 08:00 за Києвом = 05:00 UTC (літній час, UTC+3).
 * `runReminderSweep` бере `now` параметром саме заради такої фіксації.
 */
const NOW = new Date("2026-08-03T05:00:00Z");
const DAY = "2026-08-03";

interface FakeRows {
  routineHabits?: Record<string, unknown>[];
  completions?: { user_id: string; habit_id: string; state: string }[];
  /** Відповідь батч-запиту тижневих відміток гнучких звичок (`loadWeekCompletions`). */
  weekCompletions?: {
    user_id: string;
    habit_id: string;
    date_key: string;
    state: string;
  }[];
  skips?: { user_id: string; skip_key: string }[];
  fizruk?: { user_id: string; data: unknown }[];
  nutrition?: { user_id: string; prefs_json: unknown }[];
  /** Рядки `user_preferences` зі стелею (міграція 148). Нема рядка = 2. */
  caps?: { user_id: string; push_daily_cap: number }[] | undefined;
  /** Кандидати нуджа Сержанта (`selectNudgeCandidates`). */
  nudge?: Record<string, unknown>[];
}

interface FakePool {
  pool: Pool;
  /** Кожен виграний claim приводу (не слота бюджету) — один запис тут. */
  claims: { userId: string; dedupKey: string; module: string }[];
  /** Виграні слоти бюджету, `${userId}|${key}`. */
  budget: string[];
  deletes: string[];
}

/**
 * Підроблений `Pool`, що роздає відповіді за назвою таблиці в SQL.
 *
 * Журнал `push_reminder_log` змодельовано множиною ключів, як справжній
 * `ON CONFLICT DO NOTHING`: повторний прохід тієї ж хвилини програє дедуп
 * рівно так, як у Postgres. `claimWins` дозволяє змоделювати програш
 * дедупу приводу (інша репліка встигла першою) або падіння claim-у, не
 * піднімаючи Postgres.
 */
function fakePool(
  rows: FakeRows = {},
  claimWins: (n: number) => boolean | "throw" = () => true,
): FakePool {
  const claims: FakePool["claims"] = [];
  const budget: string[] = [];
  const deletes: string[] = [];
  const taken = new Set<string>();
  let claimCount = 0;

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("INSERT INTO push_reminder_log")) {
      const [userId, dedupKey, third] = (params ?? []) as string[];
      const key = `${userId}|${dedupKey}`;
      if (sql.includes("'budget'")) {
        if (taken.has(key)) return { rows: [], rowCount: 0 };
        taken.add(key);
        budget.push(key);
        return { rows: [], rowCount: 1 };
      }
      claimCount += 1;
      const verdict = claimWins(claimCount);
      if (verdict === "throw") throw new Error("db down");
      if (!verdict || taken.has(key)) return { rows: [], rowCount: 0 };
      taken.add(key);
      claims.push({ userId: userId!, dedupKey: dedupKey!, module: third! });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("DELETE FROM push_reminder_log WHERE user_id")) {
      const [userId, dedupKey] = (params ?? []) as string[];
      const key = `${userId}|${dedupKey}`;
      taken.delete(key);
      budget.splice(budget.indexOf(key), 1);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("DELETE FROM push_reminder_log")) {
      deletes.push(((params ?? []) as string[])[0]!);
      return { rows: [], rowCount: 7 };
    }
    if (sql.includes("FROM routine_habits")) {
      return { rows: rows.routineHabits ?? [], rowCount: 0 };
    }
    // Перевіряємо специфічний запит `loadWeekCompletions` ПЕРШИМ — обидва
    // запити читають `FROM routine_completion_events`, а різнить їх лише
    // додаткова умова по діапазону дат.
    if (
      sql.includes("FROM routine_completion_events") &&
      sql.includes("date_key >=")
    ) {
      return { rows: rows.weekCompletions ?? [], rowCount: 0 };
    }
    if (sql.includes("FROM routine_completion_events")) {
      return { rows: rows.completions ?? [], rowCount: 0 };
    }
    if (sql.includes("FROM routine_habit_skips")) {
      return { rows: rows.skips ?? [], rowCount: 0 };
    }
    if (sql.includes("FROM fizruk_monthly_plan")) {
      return { rows: rows.fizruk ?? [], rowCount: 0 };
    }
    if (sql.includes("FROM nutrition_prefs")) {
      return { rows: rows.nutrition ?? [], rowCount: 0 };
    }
    // Запит стелі читає лише `user_preferences`; запит нуджа теж джойнить
    // її, але починається з `FROM "user"`, тож перевіряємо його першим.
    if (sql.includes('FROM "user"')) {
      return { rows: rows.nudge ?? [], rowCount: 0 };
    }
    if (sql.includes("FROM user_preferences")) {
      return { rows: rows.caps ?? [], rowCount: 0 };
    }
    throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
  });

  return { pool: { query } as unknown as Pool, claims, budget, deletes };
}

function habitDbRow(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    user_id: "u1",
    id: "hab_1",
    name: "Зарядка",
    emoji: "🏃",
    archived: false,
    paused: false,
    pause_intervals: null,
    recurrence: "daily",
    start_date: "2026-01-01",
    end_date: null,
    time_of_day: null,
    reminder_times: ["08:00"],
    weekdays: null,
    privacy: null,
    ...over,
  };
}

describe("runReminderSweep", () => {
  beforeEach(() => sendToUserQuietly.mockClear());

  it("claims before sending and reports the minute it swept", async () => {
    const { pool, claims } = fakePool({ routineHabits: [habitDbRow()] });

    const result = await runReminderSweep(pool, NOW);

    expect(result).toMatchObject({
      dayKey: DAY,
      hm: "08:00",
      due: 1,
      sent: 1,
      deduped: 0,
    });
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ userId: "u1", module: "routine" });
    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
    // `tag` мусить збігатися з ключем дедупу — інакше клієнт покаже другий
    // банер там, де сервер уже вважає нагадування надісланим.
    expect(sendToUserQuietly.mock.calls[0]?.[1]).toMatchObject({
      tag: claims[0]?.dedupKey,
      title: "Зарядка",
    });
  });

  it("stays silent when another replica won the claim", async () => {
    const { pool } = fakePool({ routineHabits: [habitDbRow()] }, () => false);

    const result = await runReminderSweep(pool, NOW);

    expect(result).toMatchObject({ due: 1, sent: 0, deduped: 1 });
    expect(sendToUserQuietly).not.toHaveBeenCalled();
  });

  it("stays silent when the claim itself fails", async () => {
    // Без застовпленого рядка обіцянка «рівно один раз» не тримається, тож
    // мовчання дешевше за потік дублів щохвилини.
    const { pool } = fakePool({ routineHabits: [habitDbRow()] }, () => "throw");

    const result = await runReminderSweep(pool, NOW);

    expect(result).toMatchObject({ due: 1, sent: 0, deduped: 0 });
    expect(sendToUserQuietly).not.toHaveBeenCalled();
  });

  it("skips habits already completed or skipped today", async () => {
    const { pool } = fakePool({
      routineHabits: [
        habitDbRow(),
        habitDbRow({ id: "hab_2", name: "Читання" }),
      ],
      completions: [{ user_id: "u1", habit_id: "hab_1", state: "done" }],
      skips: [{ user_id: "u1", skip_key: `hab_2__${DAY}` }],
    });

    const result = await runReminderSweep(pool, NOW);

    expect(result).toMatchObject({ due: 0, sent: 0 });
  });

  it("re-queues a habit whose completion was undone", async () => {
    const { pool } = fakePool({
      routineHabits: [habitDbRow()],
      completions: [{ user_id: "u1", habit_id: "hab_1", state: "undone" }],
    });

    const result = await runReminderSweep(pool, NOW);

    expect(result).toMatchObject({ due: 1, sent: 1 });
  });

  it("does not let one user's completion mute another user's habit", async () => {
    // Регресія, від якої страхує групування по користувачу в sweep-і:
    // однакові id звичок у різних людей не мають гасити одне одного.
    const { pool, claims } = fakePool({
      routineHabits: [habitDbRow(), habitDbRow({ user_id: "u2" })],
      completions: [{ user_id: "u1", habit_id: "hab_1", state: "done" }],
    });

    const result = await runReminderSweep(pool, NOW);

    expect(result).toMatchObject({ due: 1, sent: 1 });
    expect(claims[0]?.userId).toBe("u2");
  });

  it("hides the habit name when the user asked for minimal privacy", async () => {
    const { pool } = fakePool({
      routineHabits: [habitDbRow({ privacy: "minimal" })],
    });

    await runReminderSweep(pool, NOW);

    expect(sendToUserQuietly.mock.calls[0]?.[1]).toMatchObject({
      title: "Нагадування",
    });
  });

  it("mirrors the client defaults for fizruk (opt-out) and nutrition (opt-in)", async () => {
    // Фізрук: `reminderEnabled !== false`, тобто відсутнє поле = увімкнено.
    // Харчування: `=== true`, тобто відсутнє поле = вимкнено. Обидва дефолти
    // дзеркалять клієнт — розбіжність означала б мовчання там, де перемикач
    // показано увімкненим, або пуш там, де згоди не давали.
    const at18 = new Date("2026-08-03T15:00:00Z"); // 18:00 за Києвом
    const { pool, claims } = fakePool({
      fizruk: [
        { user_id: "f1", data: { days: { [DAY]: { templateId: "t1" } } } },
        {
          user_id: "f2",
          data: {
            reminderEnabled: false,
            days: { [DAY]: { templateId: "t1" } },
          },
        },
      ],
      nutrition: [
        { user_id: "n1", prefs_json: { reminderHour: 18 } },
        {
          user_id: "n2",
          prefs_json: { reminderEnabled: true, reminderHour: 18 },
        },
      ],
    });

    const result = await runReminderSweep(pool, at18);

    expect(result.due).toBe(2);
    expect(claims.map((c) => c.userId).sort()).toEqual(["f1", "n2"]);
  });
});

describe("гнучка звичка («N разів на тиждень») у sweep-і", () => {
  beforeEach(() => sendToUserQuietly.mockClear());

  // 2026-08-06 (четвер) 08:00 за Києвом = 05:00 UTC; той самий тиждень, що
  // й у решти тестів файлу (понеділок 2026-08-03).
  const THURSDAY = new Date("2026-08-06T05:00:00Z");

  it("мовчить, коли батч-запит тижневих відміток показує добрану норму", async () => {
    // Ціль за замовчуванням — 3; пн/вт/ср добирають її ще до четверга.
    const { pool, claims } = fakePool({
      routineHabits: [habitDbRow({ recurrence: "flexible" })],
      weekCompletions: [
        {
          user_id: "u1",
          habit_id: "hab_1",
          date_key: "2026-08-03",
          state: "done",
        },
        {
          user_id: "u1",
          habit_id: "hab_1",
          date_key: "2026-08-04",
          state: "done",
        },
        {
          user_id: "u1",
          habit_id: "hab_1",
          date_key: "2026-08-05",
          state: "done",
        },
      ],
    });

    const result = await runReminderSweep(pool, THURSDAY);

    expect(result).toMatchObject({ due: 0, sent: 0 });
    expect(claims).toHaveLength(0);
    expect(sendToUserQuietly).not.toHaveBeenCalled();
  });

  it("нагадує, доки тижнева норма не добрана", async () => {
    const { pool, claims } = fakePool({
      routineHabits: [habitDbRow({ recurrence: "flexible" })],
      weekCompletions: [
        {
          user_id: "u1",
          habit_id: "hab_1",
          date_key: "2026-08-03",
          state: "done",
        },
      ],
    });

    const result = await runReminderSweep(pool, THURSDAY);

    expect(result).toMatchObject({ due: 1, sent: 1 });
    expect(claims).toHaveLength(1);
  });
});

/**
 * Спільний бюджет (спека `reward-loop-and-reminders.md`, § Верифікація 5).
 * Модулі більше не шлють пуші незалежно: усі приводи доби ділять стелю,
 * а приводи понад неї згортаються в одне сповіщення, а не губляться.
 */
describe("спільний бюджет нагадувань", () => {
  beforeEach(() => sendToUserQuietly.mockClear());

  // Звичка о 08:00 і їжа о 12:00: два модулі з приводом того самого дня.
  const twoModules = (caps: FakeRows["caps"]): FakeRows => ({
    routineHabits: [habitDbRow()],
    nutrition: [
      {
        user_id: "u1",
        prefs_json: { reminderEnabled: true, reminderHour: 12 },
      },
    ],
    caps,
  });
  /** Київський час улітку = UTC+3. */
  const at = (hmUtc: string) => new Date(`2026-08-03T${hmUtc}:00Z`);

  it("стеля 1: два приводи дають одне сповіщення в компромісний час", async () => {
    const { pool } = fakePool(
      twoModules([{ user_id: "u1", push_daily_cap: 1 }]),
    );

    // 08:00 і 12:00 за Києвом: окремих відправок більше немає.
    expect((await runReminderSweep(pool, at("05:00"))).sent).toBe(0);
    expect((await runReminderSweep(pool, at("09:00"))).sent).toBe(0);

    // 10:00 за Києвом, середина між 08:00 і 12:00.
    const result = await runReminderSweep(pool, at("07:00"));
    expect(result).toMatchObject({ hm: "10:00", due: 2, sent: 1 });
    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
    expect(sendToUserQuietly.mock.calls[0]?.[1]).toMatchObject({
      title: "Нагадування",
      body: "Сьогодні: Зарядка, запис їжі.",
    });
  });

  it("стеля 0: не приходить нічого", async () => {
    const { pool, budget } = fakePool(
      twoModules([{ user_id: "u1", push_daily_cap: 0 }]),
    );
    for (const t of ["05:00", "07:00", "09:00"]) {
      await runReminderSweep(pool, at(t));
    }
    expect(sendToUserQuietly).not.toHaveBeenCalled();
    expect(budget).toHaveLength(0);
  });

  it("без рядка налаштувань діє дефолт 2: кожен привід у свій час", async () => {
    const { pool } = fakePool(twoModules(undefined));
    expect((await runReminderSweep(pool, at("05:00"))).sent).toBe(1);
    expect((await runReminderSweep(pool, at("09:00"))).sent).toBe(1);
  });

  it("дві звички на одну хвилину дають одне сповіщення", async () => {
    const { pool } = fakePool({
      routineHabits: [habitDbRow(), habitDbRow({ id: "hab_2", name: "Вода" })],
    });
    const result = await runReminderSweep(pool, NOW);
    expect(result).toMatchObject({ due: 2, sent: 1 });
    expect(sendToUserQuietly.mock.calls[0]?.[1]).toMatchObject({
      body: "Сьогодні: Зарядка, Вода.",
    });
  });

  it("відмічена звичка випадає зі згорнутого сповіщення, решта йде", async () => {
    const { pool } = fakePool({
      ...twoModules([{ user_id: "u1", push_daily_cap: 1 }]),
      completions: [{ user_id: "u1", habit_id: "hab_1", state: "done" }],
    });
    const result = await runReminderSweep(pool, at("07:00"));
    expect(result).toMatchObject({ due: 1, sent: 1 });
    expect(sendToUserQuietly.mock.calls[0]?.[1]).toMatchObject({
      title: "Їжа",
    });
  });

  it("повторний прохід тієї ж хвилини не шле вдруге і не зʼїдає слот", async () => {
    const { pool, budget } = fakePool({ routineHabits: [habitDbRow()] });
    await runReminderSweep(pool, NOW);
    const second = await runReminderSweep(pool, NOW);
    expect(second).toMatchObject({ sent: 0, deduped: 1 });
    expect(sendToUserQuietly).toHaveBeenCalledTimes(1);
    expect(budget).toEqual(["u1|push-budget-2026-08-03-1"]);
  });

  it("нудж Сержанта ділить стелю з модулями і згортається з ними", async () => {
    // Нудж о 09:00 і звичка о 08:00 при стелі 1: одне сповіщення о 08:30,
    // заголовок веде Сержант.
    const { pool } = fakePool({
      routineHabits: [habitDbRow()],
      caps: [{ user_id: "u1", push_daily_cap: 1 }],
      nudge: [
        {
          user_id: "u1",
          last_seen_at: new Date("2026-08-01T12:00:00Z"),
          cached_body: null,
          cached_generated_at: null,
        },
      ],
    });
    const result = await runReminderSweep(pool, at("05:30"));
    expect(result).toMatchObject({ hm: "08:30", due: 2, sent: 1 });
    expect(sendToUserQuietly.mock.calls[0]?.[1]).toMatchObject({
      title: "Сержант",
      body: "Заглянь, я подивлюся на твій тиждень\nСьогодні: Зарядка.",
    });
  });
});

describe("pruneReminderLog", () => {
  it("deletes rows older than the retention window", async () => {
    const { pool, deletes } = fakePool();

    const removed = await pruneReminderLog(pool, NOW);

    expect(removed).toBe(7);
    // 45 діб до 2026-08-03.
    expect(deletes).toEqual(["2026-06-19"]);
  });
});

// ───────────────────── Bounded fan-out (аудит 2026-09-16) ────────────────
/**
 * Регресія стійкості: раніше цикл робив `void sendToUserQuietly(...)` без
 * обмеження паралелізму, а кожен виклик усередині сам віялом б'є по ВСІХ
 * пристроях користувача (`Promise.all` у `push/send.ts`). У слот нагадувань
 * (09:00/12:00/20:00) це давало лавину одночасних сокетів до APNs/FCM/web,
 * яка на 4 ГБ VPS закінчувалась не деградацією, а падінням процесу.
 *
 * Друга властивість, не менш важлива: fire-and-forget неможливо дочекатись.
 * `stop()` планувальника тепер дочікується на shutdown-і, а дочекатись можна
 * лише того, на що ми справді чекаємо.
 */
describe("runReminderSweep fan-out", () => {
  beforeEach(() => sendToUserQuietly.mockClear());

  /** 25 користувачів з тією самою звичкою на 08:00 — тобто 25 due-нагадувань. */
  function manyUsers(n: number): Record<string, unknown>[] {
    return Array.from({ length: n }, (_, i) =>
      habitDbRow({ user_id: `u${i}`, id: `hab_${i}` }),
    );
  }

  it("never runs more than the concurrency cap at once", async () => {
    const TOTAL = 25;
    let inFlight = 0;
    let peak = 0;
    sendToUserQuietly.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });

    const { pool } = fakePool({ routineHabits: manyUsers(TOTAL) });
    const result = await runReminderSweep(pool, NOW);

    expect(result.sent).toBe(TOTAL);
    expect(sendToUserQuietly).toHaveBeenCalledTimes(TOTAL);
    // Суть фіксу: пік паралельності обмежений, а не дорівнює TOTAL.
    expect(peak).toBeLessThanOrEqual(10);
    expect(peak).toBeGreaterThan(1); // і це не послідовний цикл по одному
  });

  it("awaits every send before returning", async () => {
    let finished = 0;
    sendToUserQuietly.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      finished++;
    });

    const { pool } = fakePool({ routineHabits: manyUsers(12) });
    await runReminderSweep(pool, NOW);

    // Раніше тут було б 0: прохід повертався, поки пуші ще летіли, і
    // shutdown закривав pg-пул під ними. Наслідок бачила лише людина —
    // рядок дедупу в `push_reminder_log` є, а пуш не пішов, тож
    // нагадування не приходило ВЗАГАЛІ.
    expect(finished).toBe(12);
  });

  it("claims every reminder before the first send goes out", async () => {
    const claimsAtFirstSend: number[] = [];
    const { pool, claims } = fakePool({ routineHabits: manyUsers(15) });
    sendToUserQuietly.mockImplementation(async () => {
      claimsAtFirstSend.push(claims.length);
    });

    await runReminderSweep(pool, NOW);

    // Claim лишається послідовним і повністю передує відправкам: дедуп у
    // Postgres — єдине, що тримає «рівно один раз» між репліками.
    expect(claimsAtFirstSend[0]).toBe(15);
  });
});
