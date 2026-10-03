import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@sergeant/shared";

const purgeUserData = vi.fn();

vi.mock("./dataRights.js", () => ({
  purgeUserData: (...args: unknown[]) => purgeUserData(...args),
}));

const {
  AccountDeletionPoller,
  getAccountDeletionWorkerStatus,
  __testingResetLastRunAt,
} = await import("./deletionPoller.js");

/**
 * Пул, у якому claim-запит віддає рівно ті id, які «дозріли». Сам предикат
 * дозрілості перевіряється окремим тестом нижче: у моку SQL не виконується,
 * тож єдиний чесний спосіб його закрити це перевірити текст запиту і
 * параметр вікна.
 */
function mockPool(matureIds: string[]): {
  pool: Pool;
  client: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
} {
  const client = {
    query: vi.fn().mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("FOR UPDATE SKIP LOCKED")) {
        return Promise.resolve({ rows: matureIds.map((id) => ({ id })) });
      }
      return Promise.resolve({ rows: [] });
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
  return { pool, client };
}

beforeEach(() => {
  purgeUserData.mockReset();
  purgeUserData.mockResolvedValue({ ok: true });
  __testingResetLastRunAt();
});

describe("AccountDeletionPoller", () => {
  it("добиває лише те, що віддав claim, і рівно стільки разів", async () => {
    const { pool } = mockPool(["user-old-1", "user-old-2"]);
    const poller = new AccountDeletionPoller({ pool, intervalMs: 0 });

    const result = await poller.runOnce();

    expect(result).toEqual({ claimed: 2, purged: 2, failed: 0 });
    expect(purgeUserData).toHaveBeenCalledTimes(2);
    expect(purgeUserData.mock.calls.map((c) => c[1])).toEqual([
      "user-old-1",
      "user-old-2",
    ]);
  });

  it("порожній claim — жодного видалення", async () => {
    const { pool } = mockPool([]);
    const poller = new AccountDeletionPoller({ pool, intervalMs: 0 });

    const result = await poller.runOnce();

    expect(result).toEqual({ claimed: 0, purged: 0, failed: 0 });
    expect(purgeUserData).not.toHaveBeenCalled();
  });

  /**
   * Той самий предикат, що в § Верифікація спеки: рядок, якому 29 днів, не
   * чіпаємо, а 31-денний видаляємо. У моку SQL не виконується, тож
   * перевіряємо саме умову запиту і параметр вікна: `<` від NOW() мінус
   * ACCOUNT_DELETION_GRACE_DAYS днів.
   */
  it("claim-запит відбирає лише дозрілі за вікном рядки", async () => {
    const { pool, client } = mockPool([]);
    const poller = new AccountDeletionPoller({ pool, intervalMs: 0 });

    await poller.runOnce();

    const claim = client.query.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("FOR UPDATE SKIP LOCKED"),
    );
    expect(claim).toBeDefined();
    const [sql, params] = claim as [string, unknown[]];
    expect(sql).toContain("deletion_requested_at IS NOT NULL");
    expect(sql).toContain("deletion_requested_at < NOW() -");
    expect(params[1]).toBe(String(ACCOUNT_DELETION_GRACE_DAYS));
  });

  it("падіння на одному акаунті не забирає решту пачки", async () => {
    const { pool } = mockPool(["bad", "good"]);
    purgeUserData.mockRejectedValueOnce(new Error("db down"));
    const poller = new AccountDeletionPoller({ pool, intervalMs: 0 });

    const result = await poller.runOnce();

    expect(result).toEqual({ claimed: 2, purged: 1, failed: 1 });
    expect(purgeUserData).toHaveBeenCalledTimes(2);
  });

  it("claim іде у власній транзакції і завжди відпускає клієнта", async () => {
    const { pool, client } = mockPool(["user-old-1"]);
    const poller = new AccountDeletionPoller({ pool, intervalMs: 0 });

    await poller.runOnce();

    const sql = client.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(sql[0]).toBe("BEGIN");
    expect(sql).toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("overlap-guard: повторний тик поверх запущеного повертає null", async () => {
    const { pool } = mockPool(["user-old-1"]);
    // Гейт створюємо ЗАЗДАЛЕГІДЬ, а не всередині моку: інакше `resolve`
    // зʼявляється лише коли перший тик дійде до purge, і тест сам себе
    // підвішує, чекаючи на проміс, який нікому відпустити.
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    purgeUserData.mockImplementationOnce(() => gate);
    const poller = new AccountDeletionPoller({ pool, intervalMs: 0 });

    const first = poller.runOnce();
    const second = await poller.runOnce();
    expect(second).toBeNull();

    releaseFirst();
    await first;
  });

  it("intervalMs = 0 не запускає таймер", () => {
    const { pool } = mockPool([]);
    const poller = new AccountDeletionPoller({ pool, intervalMs: 0 });
    const spy = vi.spyOn(global, "setInterval");

    poller.start();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("getAccountDeletionWorkerStatus", () => {
  it("розділяє акаунти у вікні та прострочені (bigint коерситься в number)", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        // Hard Rule #1: pg віддає bigint як string.
        rows: [{ waiting: "3", overdue: "1" }],
      }),
    };

    const status = await getAccountDeletionWorkerStatus(pool, 60_000);

    expect(status.pending).toEqual({ waiting: 3, overdue: 1 });
    expect(status.enabled).toBe(true);
    expect(status.graceDays).toBe(ACCOUNT_DELETION_GRACE_DAYS);
    expect(status.errorCode).toBeUndefined();
  });

  it("на збої БД віддає errorCode і не кидає — /health/workers має лишатись досяжним", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("connection refused")),
    };

    const status = await getAccountDeletionWorkerStatus(pool, 60_000);

    expect(status.pending).toBeNull();
    expect(status.errorCode).toBeDefined();
    // Текст помилки назовні не йде: pg кладе туди імʼя DB-користувача.
    expect(JSON.stringify(status)).not.toContain("connection refused");
  });

  it("intervalMs = 0 означає вимкнений добивач", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ waiting: "0", overdue: "0" }] }),
    };

    const status = await getAccountDeletionWorkerStatus(pool, 0);

    expect(status.enabled).toBe(false);
  });
});
