// rel-62: advisory-lock раннера міграцій береться опитуванням
// `pg_try_advisory_lock` з власним дедлайном. Клієнт і годинник — моки,
// жодного Postgres.

import { describe, expect, it, vi } from "vitest";
import {
  acquireMigrationLock,
  MIGRATION_LOCK_TIMEOUT_CODE,
  type LockQueryClient,
} from "./migrateLock.js";

const KEY = 7317483629462015n;

function fakeClient(answers: boolean[]): {
  client: LockQueryClient;
  calls: Array<{ text: string; values: unknown[] | undefined }>;
} {
  const calls: Array<{ text: string; values: unknown[] | undefined }> = [];
  let i = 0;
  const client: LockQueryClient = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      calls.push({ text, values });
      const locked = answers[Math.min(i, answers.length - 1)] ?? false;
      i += 1;
      return { rows: [{ locked }] };
    }) as unknown as LockQueryClient["query"],
  };
  return { client, calls };
}

/** Віртуальний годинник: `sleep` просуває `now`, а не чекає. */
function fakeClock() {
  let t = 1_000;
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      t += ms;
    }),
  };
}

describe("acquireMigrationLock", () => {
  it("бере lock першою спробою і не спить", async () => {
    const { client, calls } = fakeClient([true]);
    const clock = fakeClock();

    await acquireMigrationLock(client, KEY, { waitMs: 5_000, ...clock });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toContain("pg_try_advisory_lock");
    expect(calls[0]!.text).not.toMatch(/pg_advisory_lock\(/);
    expect(calls[0]!.values).toEqual([KEY.toString()]);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it("опитує, поки інша сесія тримає lock, і бере його, коли звільнилось", async () => {
    const { client, calls } = fakeClient([false, false, true]);
    const clock = fakeClock();

    await acquireMigrationLock(client, KEY, {
      waitMs: 10_000,
      pollMs: 1_000,
      ...clock,
    });

    expect(calls).toHaveLength(3);
    expect(clock.sleep).toHaveBeenCalledTimes(2);
    expect(clock.sleep).toHaveBeenCalledWith(1_000);
  });

  it("по дедлайну кидає MIGRATION_LOCK_TIMEOUT, а не чекає безстроково", async () => {
    const { client, calls } = fakeClient([false]);
    const clock = fakeClock();

    await expect(
      acquireMigrationLock(client, KEY, {
        waitMs: 2_500,
        pollMs: 1_000,
        ...clock,
      }),
    ).rejects.toMatchObject({ code: MIGRATION_LOCK_TIMEOUT_CODE });

    // 0 → 1000 → 2000 → 2500 (остання пауза обрізана до залишку) → здається.
    expect(calls).toHaveLength(4);
    expect(clock.sleep.mock.calls.map((c) => c[0])).toEqual([
      1_000, 1_000, 500,
    ]);
  });

  it("waitMs = 0 — рівно одна спроба", async () => {
    const { client, calls } = fakeClient([false]);
    const clock = fakeClock();

    await expect(
      acquireMigrationLock(client, KEY, { waitMs: 0, ...clock }),
    ).rejects.toMatchObject({ code: MIGRATION_LOCK_TIMEOUT_CODE });
    expect(calls).toHaveLength(1);
    expect(clock.sleep).not.toHaveBeenCalled();
  });
});
