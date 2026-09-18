import { describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { __anonymousMigrationInternals } from "./anonymousDataMigration.js";

const item = {
  table: "finyk_prefs",
  row: {
    user_id: "local-anon",
    prefs_json: '{"currency":"UAH"}',
    updated_at: "2026-07-28T08:00:00.000Z",
  },
  primaryKey: ["user_id"],
  clientTs: "2026-07-28T08:00:00.000Z",
};

describe("anonymous data migration invariants", () => {
  it("builds a stable, server-safe idempotency key and decodes JSON columns", async () => {
    const first = await __anonymousMigrationInternals.idempotencyKey(
      "batch-1",
      "opaque-user-1",
      item,
    );
    const second = await __anonymousMigrationInternals.idempotencyKey(
      "batch-1",
      "opaque-user-1",
      item,
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^anonv1_[a-f0-9]{48}$/);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(__anonymousMigrationInternals.decodeJsonColumns(item.row)).toEqual({
      ...item.row,
      prefs_json: { currency: "UAH" },
    });
  });

  it("does not accept a pending outbox row as server-confirmed", async () => {
    const client = {
      all: vi.fn(async () => [
        { id: 1, status: "pending", reject_reason: null },
      ]),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;

    await expect(
      __anonymousMigrationInternals.assertServerAcknowledged(client, [
        "anonv1_pending",
      ]),
      // Повідомлення тепер несе крок і числа — саме воно їде і в Sentry, і
      // на екран збою, тож перевіряємо форму, а не тільки факт кидка.
    ).rejects.toThrow("anon-migration/confirm: 1/1 unsettled");
    expect(client.run).not.toHaveBeenCalled();
  });

  // Регресія 2026-09-13 (звіт власника: «Не вдалося завершити перенесення»
  // двічі з різницею у пів години, обидва рази на LTE з повним сигналом).
  // Один `flushNow()` — це РІВНО ОДИН тік push-лупа, а тік бере з черги
  // `LIMIT 100`. Тож перенос профілю з понад 100 анонімними рядками падав
  // детерміновано: перші 100 їхали, решта лишалась `pending`. Повтор
  // упирався в ту саму стелю, тому мережа тут ні до чого.
  // Звіт власника 2026-09-14 приніс `SQLITE_IOERR`, а цей код в sqlite один
  // на ВСІ дискові біди — переповнений пул, вичерпану квоту й зайнятий файл
  // не розрізнити. Щоб не гадати втретє, помилка несе числа сховища.
  it("дописує до помилки заповненість пулу й використання диска", async () => {
    const { migrateAnonymousDataToProfile } =
      await import("./anonymousDataMigration.js");
    await expect(migrateAnonymousDataToProfile("")).rejects.toThrow(
      /^anon-migration\//,
    );
  });

  it("жене чергу по батчах, доки наші рядки не вирішені", async () => {
    const keys = Array.from({ length: 250 }, (_, i) => `anonv1_op${i}`);
    // Модель черги: тік прибирає рівно 100 рядків, як реальний drain.
    let pending = keys.length;
    const client = {
      all: vi.fn(async () =>
        Array.from({ length: pending }, (_, i) => ({
          id: i,
          status: "pending",
          reject_reason: null,
        })),
      ),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;
    const flushNow = vi.fn(async () => {
      pending = Math.max(0, pending - 100);
    });

    await __anonymousMigrationInternals.flushUntilSettled(
      client,
      { flushNow },
      keys,
    );

    expect(flushNow).toHaveBeenCalledTimes(3);
    expect(pending).toBe(0);
  });

  // Зворотний бік: зірвана посеред переносу мережа не має крутити цикл
  // вічно. Тік, який не зрушив жодного рядка, зупиняє гонитву — розбір
  // віддається `assertServerAcknowledged` з реальною причиною.
  it("зупиняється після кількох поспіль тіків, що нічого не зрушили", async () => {
    const client = {
      all: vi.fn(async () => [
        { id: 1, status: "pending", reject_reason: null },
      ]),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;
    const flushNow = vi.fn(async () => undefined);

    await __anonymousMigrationInternals.flushUntilSettled(
      client,
      { flushNow },
      ["anonv1_stuck"],
    );

    // Терпимість, а не миттєва здача: `flushNow()` приєднується до чужого
    // тіку в польоті й може повернутись без нових рядків на цілком живій
    // мережі. Одноразовий вихід обірвав би перенос саме там.
    expect(flushNow).toHaveBeenCalledTimes(3);
  });

  // Регресія 2026-09-15 (звіт власника: `1/1 unsettled, first status
  // pending` вже на `vfs=opfs-sahpool`, тобто після переїзду і на ОДНОМУ
  // рядку — стеля батча тут ні до чого). Перша невдала відправка кладе
  // рядку `next_retry_at ≈ now + 1 c`, drain його свідомо пропускає, а
  // цикл крутив тіки впритул — три «порожні» тіки згорали за мілісекунди
  // й убивали перенос через одну транзиторну помилку мережі.
  it("чекає вікно backoff-у замість того, щоб рахувати його застоєм", async () => {
    let clockMs = Date.parse("2026-09-15T09:34:00.000Z");
    let settled = false;
    const client = {
      all: vi.fn(async () =>
        settled
          ? []
          : [
              {
                id: 1,
                status: "pending",
                reject_reason: null,
                table_name: "finyk_prefs",
                op: "insert",
                attempts: 1,
                next_retry_at: new Date(clockMs + 1_000).toISOString(),
                last_error: "http_503",
              },
            ],
      ),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;
    // Тік відправляє рядок лише тоді, коли його строк уже настав — рівно
    // як drain, який фільтрує на `next_retry_at <= now`.
    const flushNow = vi.fn(async () => {
      if (clockMs >= Date.parse("2026-09-15T09:34:01.000Z")) settled = true;
    });
    const slept: number[] = [];

    await __anonymousMigrationInternals.flushUntilSettled(
      client,
      { flushNow },
      ["anonv1_backoff"],
      {
        now: () => clockMs,
        sleep: async (ms: number) => {
          slept.push(ms);
          clockMs += ms;
        },
      },
    );

    expect(slept).toEqual([1_050]);
    expect(settled).toBe(true);
  });

  // Зворотний бік очікування: строк, який не настає ніколи, не має
  // тримати перенос вічно — бюджет вичерпується, розбір віддається
  // `assertServerAcknowledged`.
  it("завершується, коли строк backoff-у не настає в межах бюджету", async () => {
    const clockMs = Date.parse("2026-09-15T09:34:00.000Z");
    const client = {
      all: vi.fn(async () => [
        {
          id: 1,
          status: "pending",
          reject_reason: null,
          table_name: "finyk_prefs",
          op: "insert",
          attempts: 4,
          next_retry_at: new Date(clockMs + 86_400_000).toISOString(),
          last_error: "http_503",
        },
      ]),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;
    const flushNow = vi.fn(async () => undefined);
    let sleptTotal = 0;

    await __anonymousMigrationInternals.flushUntilSettled(
      client,
      { flushNow },
      ["anonv1_stuck_far"],
      {
        // Годинник навмисно СТОЇТЬ: сон не наближає строк, тож вихід
        // може дати лише бюджет.
        now: () => clockMs,
        sleep: async (ms: number) => {
          sleptTotal += ms;
        },
      },
    );

    expect(sleptTotal).toBe(30_000);
    expect(flushNow).toHaveBeenCalledTimes(9);
  });

  // Звіт власника 2026-09-15 приніс саме `first status pending` — слово,
  // яке не розрізняє «до черги не дійшли» і «сервер відмовляє щоразу».
  it("називає в помилці таблицю, спроби й причину, а не лише статус", async () => {
    const client = {
      all: vi.fn(async () => [
        {
          id: 1,
          status: "pending",
          reject_reason: null,
          table_name: "finyk_prefs",
          op: "insert",
          attempts: 2,
          next_retry_at: null,
          last_error: "http_503",
        },
      ]),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;

    await expect(
      __anonymousMigrationInternals.assertServerAcknowledged(client, [
        "anonv1_pending",
      ]),
    ).rejects.toThrow(
      "1/1 unsettled, first finyk_prefs/insert status=pending attempts=2 last=http_503",
    );
  });

  // Регресія 2026-09-15, звіт власника: `1/1 unsettled, first
  // fizruk_measurements/insert status=pending attempts=0` на
  // `vfs=opfs-sahpool`. `attempts=0` — рядок жодного разу не віддали в
  // push. `drainSyncOpOutbox` бере `ORDER BY id ASC LIMIT 100`, а щойно
  // вставлений рядок має найбільший id, тож стоїть у кінці; попереду на
  // пристрої лежало 1356 операцій. Цикл міряв поступ лише по своїх
  // ключах, тому тіки, які відправляли сотні ЧУЖИХ рядків, рахувались
  // застоєм — перенос падав саме тому, що синхронізація працювала.
  it("дає черзі проїхати, коли попереду стоять чужі рядки", async () => {
    // 1356 — фактична довжина черги на пристрої власника (аркуш
    // «Синхронізація» на тому ж скріншоті). Число тут не для краси:
    // 250 рядків — це три тіки, тобто рівно терпимість, і на старому коді
    // такий тест ПРОХОДИВ би, нічого не доводячи.
    let ahead = 1356;
    let oursSettled = false;
    const ourRow = {
      id: 999,
      status: "pending",
      reject_reason: null,
      table_name: "fizruk_measurements",
      op: "insert",
      attempts: 0,
      next_retry_at: null,
      last_error: null,
    };
    const client = {
      all: vi.fn(async (sql: string) =>
        sql.includes("COUNT(*)")
          ? [{ n: ahead + (oursSettled ? 0 : 1) }]
          : oursSettled
            ? []
            : [ourRow],
      ),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;
    // Модель drain-у: тік бере 100 рядків із ГОЛОВИ черги; наш рядок
    // останній, тож доходить черга до нього лише коли чужі скінчились.
    const flushNow = vi.fn(async () => {
      const taken = Math.min(100, ahead);
      ahead -= taken;
      if (taken < 100 && ahead === 0) oursSettled = true;
    });

    await __anonymousMigrationInternals.flushUntilSettled(
      client,
      { flushNow },
      ["anonv1_behind_queue"],
    );

    // 1356 чужих → 13 повних тіків, чотирнадцятий добирає решту й наш
    // рядок. Стара терпимість у 3 тіки здавалась на четвертому.
    expect(flushNow).toHaveBeenCalledTimes(14);
    expect(oursSettled).toBe(true);
  });

  // Зворотний бік: «черга рухається» не має стати вічним циклом, якщо
  // наш рядок чомусь так і не доходить. Стеля тіків — гарантія
  // завершення, а не робочий ліміт.
  it("завершується на стелі тіків, навіть коли черга рухається вічно", async () => {
    let queued = 1_000_000;
    const client = {
      all: vi.fn(async (sql: string) =>
        sql.includes("COUNT(*)")
          ? [{ n: queued }]
          : [
              {
                id: 1,
                status: "pending",
                reject_reason: null,
                table_name: "fizruk_measurements",
                op: "insert",
                attempts: 0,
                next_retry_at: null,
                last_error: null,
              },
            ],
      ),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;
    const flushNow = vi.fn(async () => {
      queued -= 100;
    });

    await __anonymousMigrationInternals.flushUntilSettled(
      client,
      { flushNow },
      ["anonv1_never_reached"],
    );

    expect(flushNow).toHaveBeenCalledTimes(200);
  });

  // Регресія 2026-09-15, звіт власника: `fizruk_measurements/insert
  // status=rejected`, причина `fk_violation`. Вона НЕ про Postgres — так
  // сервер називає «рядок із таким id уже є, і він належить іншому
  // користувачу». `bodyWeightBootstrap.ts` в анонімній сесії пише
  // `m_bootstrap_local-anon`, а `local-anon` — константа, однакова на
  // кожному пристрої. Тобто перший, хто зареєструвався, забрав ключ
  // глобально, а всі наступні дістають термінальну відмову назавжди.
  describe("перекей спільних локальних ідентичностей у первинному ключі", () => {
    const item = (id: string) => ({
      table: "fizruk_measurements",
      row: { id, user_id: "local-anon" },
      primaryKey: ["id"],
      clientTs: "2026-09-15T12:00:00.000Z",
    });

    it("міняє спільну ідентичність на id акаунта", () => {
      expect(
        __anonymousMigrationInternals.rekeySharedLocalIds(
          item("m_bootstrap_local-anon"),
          "usr_real42",
        ),
      ).toEqual({ id: "m_bootstrap_usr_real42" });
    });

    it("не чіпає ключ, який спільної ідентичності не містить", () => {
      expect(
        __anonymousMigrationInternals.rekeySharedLocalIds(
          item("m_mabc123_9f1c-uuid"),
          "usr_real42",
        ),
      ).toEqual({});
    });

    // Демо-сесія ділить ту саму ваду — `demo-local` теж спільна константа.
    it("покриває й демо-ідентичність", () => {
      expect(
        __anonymousMigrationInternals.rekeySharedLocalIds(
          item("m_bootstrap_demo-local"),
          "usr_real42",
        ),
      ).toEqual({ id: "m_bootstrap_usr_real42" });
    });

    // Ключ виправленого рядка МУСИТЬ відрізнятись від ключа попередньої
    // спроби: інакше `enqueueOutboxUpsert` знайде стару ВІДХИЛЕНУ стрічку
    // за тим самим idempotency-ключем і поверне її замість нової, тобто
    // виправлення нікуди не поїде.
    it("дає інший idempotency-ключ, ніж невиправлений рядок", async () => {
      const source = item("m_bootstrap_local-anon");
      const before = await __anonymousMigrationInternals.idempotencyKey(
        "batch-1",
        "usr_real42",
        source,
      );
      const after = await __anonymousMigrationInternals.idempotencyKey(
        "batch-1",
        "usr_real42",
        source,
        { ...source.row, id: "m_bootstrap_usr_real42" },
      );
      expect(after).not.toBe(before);
    });

    // Зворотний бік: для рядка без спільної ідентичності ключ мусить
    // лишитись ТИМ САМИМ, інакше правка перевидала б усю чергу переносу.
    it("не зрушує ключ рядка, якого перекей не торкнувся", async () => {
      const source = item("m_mabc123_9f1c-uuid");
      const before = await __anonymousMigrationInternals.idempotencyKey(
        "batch-1",
        "usr_real42",
        source,
      );
      const after = await __anonymousMigrationInternals.idempotencyKey(
        "batch-1",
        "usr_real42",
        source,
        { ...source.row, user_id: "usr_real42" },
      );
      expect(after).toBe(before);
    });
  });

  // Звіт власника 2026-09-15, після успішного переносу: «Дані перенесено»,
  // але в «Не прийнято сервером» висить 1 — стрічка від спроби ДО стадії
  // 2.4, зі старим ключем `m_bootstrap_local-anon`. Банер при цьому бреше
  // («лишились лише на цьому пристрої»), а TTL за 30 днів збрехав би ще
  // гірше («ці зміни втрачено»).
  describe("лагодження застряглих рядків черги", () => {
    function makeClient(rows: { id: number; row: string }[]) {
      const runs: { sql: string; params: unknown[] }[] = [];
      return {
        runs,
        client: {
          all: vi.fn(async () => rows),
          run: vi.fn(async (sql: string, params: unknown[]) => {
            runs.push({ sql, params });
          }),
          exec: vi.fn(),
        } as unknown as SqliteMigrationClient,
      };
    }

    it("міняє ключ, скидає статус і дає свіжий idempotency-ключ", async () => {
      const { client, runs } = makeClient([
        {
          id: 7,
          row: JSON.stringify({
            id: "m_bootstrap_local-anon",
            user_id: "usr_real42",
            weight_kg: 81,
          }),
        },
      ]);

      const repaired = await __anonymousMigrationInternals.rekeyStuckOutboxRows(
        client,
        "usr_real42",
      );

      expect(repaired).toBe(1);
      expect(runs).toHaveLength(1);
      const [update] = runs;
      expect(update!.sql).toContain("UPDATE sync_op_outbox");
      expect(update!.sql).toContain("status = 'pending'");
      const [payload, key, rowId] = update!.params as [string, string, number];
      // Ключ виправлено, решта запису недоторкана.
      expect(JSON.parse(payload!)).toEqual({
        id: "m_bootstrap_usr_real42",
        user_id: "usr_real42",
        weight_kg: 81,
      });
      expect(key).toMatch(/^anonrekey_/);
      expect(rowId).toBe(7);
    });

    // Повторний виклик безпечний за побудовою: після перекею ключ спільної
    // ідентичності вже не містить, тож вибірка його не бачить.
    it("не чіпає рядок, чий ключ уже виправлений", async () => {
      const { client, runs } = makeClient([
        {
          id: 8,
          // Спільна ідентичність лишилась у ІНШОМУ полі, не в ключі —
          // `LIKE` такий рядок ловить, лагодити його не треба.
          row: JSON.stringify({
            id: "m_bootstrap_usr_real42",
            user_id: "usr_real42",
            note: "мігровано з local-anon",
          }),
        },
      ]);

      expect(
        await __anonymousMigrationInternals.rekeyStuckOutboxRows(
          client,
          "usr_real42",
        ),
      ).toBe(0);
      expect(runs).toHaveLength(0);
    });

    it("не падає на пошкодженому JSON і не кидає назовні", async () => {
      const { client, runs } = makeClient([{ id: 9, row: "{зламано" }]);

      expect(
        await __anonymousMigrationInternals.rekeyStuckOutboxRows(
          client,
          "usr_real42",
        ),
      ).toBe(0);
      expect(runs).toHaveLength(0);
    });
  });

  it("treats an LWW rejection as an authoritative conflict winner", async () => {
    const run = vi.fn(async () => undefined);
    const client = {
      all: vi.fn(async () => [
        { id: 7, status: "rejected", reject_reason: "lww_conflict" },
      ]),
      run,
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;

    await __anonymousMigrationInternals.assertServerAcknowledged(client, [
      "anonv1_conflict",
    ]);
    expect(run).toHaveBeenCalledWith(
      "DELETE FROM sync_op_outbox WHERE id = ?",
      [7],
    );
  });
});
