// Migration 087 — `nutrition_goal_periods` (W1-KBJU-APPEND, стадія 1).
//
// Два лейни в одному файлі, і це навмисно.
// -----------------------------------------
// 1. СТАТИЧНИЙ лейн (`087 — …`) читає SQL як текст. Він ловить НАМІР:
//    міграція мусить лишитись ADDITIVE (Hard Rule #4), `origin` мусить
//    містити 'backfill', backfill мусить бути ідемпотентним. Працює на
//    машині без Docker, де testcontainers-лейн мовчки скіпається і нічого
//    не доводить.
// 2. ЖИВИЙ лейн (`087 — backfill на живому Postgres`) — за зразком
//    `061-n8n-webhook-events.test.ts`: Testcontainers + soft-skip. Він
//    єдиний, хто реально доводить, що backfill робить те, що обіцяє:
//    рахує Kyiv-локальний день з `eaten_at`, не видає рядок юзеру без
//    цілі, не дублює рядок на повторному прогоні і віддає числа, які
//    коерсяться в `number` (Hard Rule #1).
//
// Статичний лейн НЕ замінює живий: регексп над текстом не відрізнить
// правильний backfill від синтаксично схожого неправильного.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP = path.join(MIGRATIONS_DIR, "087_nutrition_goal_periods.sql");
const DOWN = path.join(MIGRATIONS_DIR, "087_nutrition_goal_periods.down.sql");

let up = "";
let down = "";

beforeAll(async () => {
  up = await fs.readFile(UP, "utf8");
  down = await fs.readFile(DOWN, "utf8");
});

/** SQL без коментарів — щоб `-- DROP …` у преамбулі не ламав перевірки. */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

/** Тіло `CREATE TABLE (...)` — саме оголошення колонок, без COMMENT-текстів. */
function createTableBody(sql: string): string {
  const match =
    /CREATE TABLE IF NOT EXISTS nutrition_goal_periods\s*\(([\s\S]*?)\n\);/.exec(
      statementsOnly(sql),
    );
  if (!match) throw new Error("CREATE TABLE block not found in migration 087");
  return match[1]!;
}

describe("087 — форма таблиці", () => {
  it("створює nutrition_goal_periods ідемпотентно", () => {
    expect(up).toMatch(/CREATE TABLE IF NOT EXISTS nutrition_goal_periods/);
  });

  it("тримає id як TEXT, а не UUID", () => {
    // AI-DANGER: писар — клієнт, і його id ДЕТЕРМІНОВАНИЙ
    // (`gp::<effective_from>::<values>::<deviceId>`), щоб повторна доставка
    // push-а була no-op, а не другим періодом з тими самими числами.
    // UUID-колонка дала б 22P02 на кожному реальному push-і — той самий
    // клас багу, що в docs/90-work/tech-debt/backend.md § «Routine: PK-тип».
    const body = createTableBody(up);
    expect(body).toMatch(/id\s+TEXT PRIMARY KEY/);
    expect(body).not.toMatch(/\bUUID\b/);
  });

  it("тримає effective_from як Kyiv-локальний day key 'YYYY-MM-DD'", () => {
    // Доменний інваріант: день у Sergeant — Kyiv-локальний календарний день,
    // рівно як `nutrition_water_log.date_key`. CHECK не дає клієнту з іншою
    // доктриною залити ISO-instant.
    const body = createTableBody(up);
    expect(body).toMatch(/effective_from\s+TEXT NOT NULL/);
    expect(body).toMatch(
      /CHECK \(effective_from ~ '\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$'\)/,
    );
  });

  it("тримає цілі NULLABLE — «цілі немає» це не нуль", () => {
    // `dailyTargetKcal = null` — валідний дефолт (`defaultNutritionPrefs()`).
    // NOT NULL DEFAULT 0 перетворив би «ціль не задана» на «весь день у
    // мінусі» для кожного юзера без цілі.
    const body = createTableBody(up);
    for (const col of [
      "kcal",
      "protein_g",
      "fat_g",
      "carbs_g",
      "water_ml",
    ] as const) {
      expect(body).toMatch(new RegExp(`\\n\\s*${col}\\s+(INTEGER|REAL),`));
      expect(body).not.toMatch(new RegExp(`${col}\\s+(INTEGER|REAL) NOT NULL`));
    }
  });

  it("закриває origin enum-ом CHECK і ОБОВʼЯЗКОВО містить 'backfill'", () => {
    // 'backfill' — не декорація, а прапорець «ми припустили, а не знаємо».
    // Без нього міграція навічно фіксує рівно ту брехню, яку задача лікує.
    expect(createTableBody(up)).toMatch(
      /CHECK \(origin IN \('manual', 'preset', 'tdee', 'backfill'\)\)/,
    );
  });

  it("тримає FK на user(id) з каскадом", () => {
    expect(createTableBody(up)).toMatch(
      /REFERENCES "user"\(id\) ON DELETE CASCADE/,
    );
  });

  it("має deleted_at для ретракції періоду", () => {
    expect(createTableBody(up)).toMatch(/deleted_at\s+TIMESTAMPTZ/);
  });
});

describe("087 — індекси", () => {
  it("створює індекс резолвера з tie-break по created_at", () => {
    expect(up).toMatch(
      /CREATE INDEX IF NOT EXISTS nutrition_goal_periods_user_effective_idx\s*\n\s*ON nutrition_goal_periods \(user_id, effective_from DESC, created_at DESC\)/,
    );
  });

  it("створює частковий індекс по живих періодах", () => {
    expect(up).toMatch(
      /CREATE INDEX IF NOT EXISTS nutrition_goal_periods_user_active_idx[\s\S]*?WHERE deleted_at IS NULL/,
    );
  });
});

describe("087 — backfill (статичні інваріанти)", () => {
  it("пише рівно в нову таблицю і нікуди більше", () => {
    const body = statementsOnly(up);
    const inserts = body.match(/INSERT INTO\s+(\w+)/g) ?? [];
    expect(inserts).toEqual(["INSERT INTO nutrition_goal_periods"]);
  });

  it("позначає реконструйований рядок origin='backfill'", () => {
    expect(statementsOnly(up)).toMatch(/'backfill',/);
  });

  it("ідемпотентний подвійно: NOT EXISTS + ON CONFLICT DO NOTHING", () => {
    // Coolify виконує міграції як pre_deployment_command і може ретраїти
    // крок. Другий прогін НЕ має додати юзеру другого періоду.
    const body = statementsOnly(up);
    expect(body).toMatch(
      /NOT EXISTS \(\s*SELECT 1 FROM nutrition_goal_periods g WHERE g\.user_id = s\.user_id\s*\)/,
    );
    expect(body).toMatch(/ON CONFLICT \(id\) DO NOTHING;/);
  });

  it("рахує effective_from у Kyiv, а не в UTC", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(
      /MIN\(m\.eaten_at AT TIME ZONE 'Europe\/Kyiv'\), 'YYYY-MM-DD'/,
    );
    expect(body).toMatch(
      /to_char\(s\.prefs_created_at AT TIME ZONE 'Europe\/Kyiv', 'YYYY-MM-DD'\)/,
    );
  });

  it("НЕ рахує waterGoalMl ознакою наявної цілі", () => {
    // `waterGoalMl` має дефолт 2000 у КОЖНОГО юзера. У предикаті він видав
    // би backfill-рядок геть усім, зокрема тим, хто цілі ніколи не ставив.
    const predicate = /WHERE \(([\s\S]*?)\)\n\s*AND NOT EXISTS/.exec(
      statementsOnly(up),
    );
    expect(predicate).not.toBeNull();
    expect(predicate![1]).not.toMatch(/water/);
    for (const col of ["kcal", "protein_g", "fat_g", "carbs_g"]) {
      expect(predicate![1]).toMatch(new RegExp(`s\\.${col}\\s+IS NOT NULL`));
    }
  });

  it("guard-ить cast із JSONB регекспом замість голого ::numeric", () => {
    // `prefs_json` — відкритий блоб; голий cast поклав би всю міграцію на
    // 22P02 через один зіпсований рядок.
    const body = statementsOnly(up);
    expect(body).toMatch(/CASE WHEN kcal_txt\s+~ '\^-\?\[0-9\]\+/);
    expect(body).not.toMatch(/prefs_json ->> '\w+'\)?::/);
  });
});

describe("087 — Hard Rule #4: forward-міграція чисто additive", () => {
  it("не робить ЖОДНОГО ALTER", () => {
    expect(statementsOnly(up)).not.toMatch(/\bALTER TABLE\b/);
  });

  it("не робить DROP у forward-міграції", () => {
    expect(statementsOnly(up)).not.toMatch(/\bDROP\b/);
  });

  it("не мутує жодну існуючу nutrition-таблицю", () => {
    // Найгірший регрес цієї хвилі — «заодно» підправити `nutrition_prefs`
    // і зламати робочий шлях, який лишається єдиним джерелом для UI.
    const body = statementsOnly(up);
    for (const table of [
      "nutrition_prefs",
      "nutrition_meals",
      "nutrition_pantry_items",
      "nutrition_pantries",
    ]) {
      expect(body).not.toMatch(
        new RegExp(`(ALTER|DROP|UPDATE|DELETE FROM|INSERT INTO)\\s+${table}`),
      );
    }
  });
});

describe("087 — down-міграція", () => {
  it("існує і прибирає рівно ту таблицю, яку створила", () => {
    expect(down).toMatch(/DROP TABLE IF EXISTS nutrition_goal_periods;/);
  });

  it("не відкочує нічого чужого", () => {
    const body = statementsOnly(down);
    expect(body).not.toMatch(/nutrition_prefs/);
    expect(body).not.toMatch(/ALTER TABLE/);
  });
});

describe("087 — документованість", () => {
  it("COMMENT ON TABLE фіксує межу стадії 1 і append-only-інваріант", () => {
    expect(up).toMatch(/COMMENT ON TABLE nutrition_goal_periods IS/);
    expect(up).toMatch(/WRITTEN but NOT READ as of stage 1/);
    expect(up).toMatch(/append_only_violation/);
  });

  it("COMMENT ON COLUMN пояснює origin, effective_from, kcal, deleted_at", () => {
    for (const column of ["effective_from", "origin", "kcal", "deleted_at"]) {
      expect(up).toMatch(
        new RegExp(`COMMENT ON COLUMN nutrition_goal_periods\\.${column} IS`),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Живий лейн — Testcontainers. Soft-skip, коли Docker недоступний.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 180_000;

let container: StartedTestContainer | undefined;
let pool: pg.Pool | undefined;
let dockerAvailable = false;

beforeAll(async () => {
  try {
    container = await new GenericContainer("pgvector/pgvector:pg17")
      .withEnvironment({
        POSTGRES_USER: "hub",
        POSTGRES_PASSWORD: "hub",
        POSTGRES_DB: "hub_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();

    pool = new pg.Pool({
      connectionString: `postgresql://hub:hub@${container.getHost()}:${container.getMappedPort(5432)}/hub_test`,
      max: 4,
    });
    dockerAvailable = true;
  } catch (e) {
    console.warn(
      `[087-nutrition-goal-periods] Skipping live lane: Testcontainers unavailable — ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  await pool?.end().catch(() => {});
  await container?.stop().catch(() => {});
}, TIMEOUT_MS);

async function readUpMigrations(): Promise<string[]> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort();
}

/**
 * Прокрутити forward-міграції на чистій схемі СТРОГО ДО 087 (001–086) —
 * рівно той стан, у якому 087 запускалася б у проді. Пізніші міграції
 * застосовувати не можна: вони залежать від таблиці, яку створює сама 087
 * (109 додає їй tz_offset_min, 110 — CHECK на день-ключ), тож «усі, крім
 * 087» падали б на неіснуючій nutrition_goal_periods.
 */
async function applyForwardExcept087(p: pg.Pool): Promise<void> {
  await p.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  await p.query(`GRANT ALL ON SCHEMA public TO public;`);
  for (const f of await readUpMigrations()) {
    if (Number.parseInt(f.slice(0, 3), 10) >= 87) break;
    const sql = (
      await fs.readFile(path.join(MIGRATIONS_DIR, f), "utf8")
    ).trim();
    if (sql) await p.query(sql);
  }
}

async function apply087(p: pg.Pool): Promise<void> {
  await p.query(up);
}

interface SeededUser {
  readonly id: string;
  readonly prefs: Record<string, unknown>;
  /** ISO-інстанти прийомів їжі; порожньо = юзер нічого не логував. */
  readonly meals: readonly string[];
}

async function seed(p: pg.Pool, users: readonly SeededUser[]): Promise<void> {
  for (const u of users) {
    await p.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $1, $1 || '@example.test', false, NOW(), NOW())`,
      [u.id],
    );
    await p.query(
      `INSERT INTO nutrition_prefs (user_id, prefs_json, created_at, updated_at)
       VALUES ($1, $2::jsonb, '2026-03-01T10:00:00Z', NOW())`,
      [u.id, JSON.stringify(u.prefs)],
    );
    for (const [i, eatenAt] of u.meals.entries()) {
      await p.query(
        `INSERT INTO nutrition_meals (user_id, eaten_at, name)
         VALUES ($1, $2, $3)`,
        [u.id, eatenAt, `meal-${i}`],
      );
    }
  }
}

interface GoalPeriodRow {
  id: string;
  user_id: string;
  effective_from: string;
  kcal: number | string | null;
  protein_g: number | string | null;
  water_ml: number | string | null;
  origin: string;
}

async function periodsOf(p: pg.Pool, userId: string): Promise<GoalPeriodRow[]> {
  const r = await p.query<GoalPeriodRow>(
    `SELECT id, user_id, effective_from, kcal, protein_g, water_ml, origin
       FROM nutrition_goal_periods WHERE user_id = $1 ORDER BY id`,
    [userId],
  );
  return r.rows;
}

describe("087 — backfill на живому Postgres", () => {
  it(
    "реконструює один рядок на юзера з ціллю і мовчить для юзера без цілі",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      await applyForwardExcept087(pool);
      await seed(pool, [
        {
          id: "u-with-goal",
          prefs: {
            dailyTargetKcal: 2400,
            dailyTargetProtein_g: 150,
            dailyTargetFat_g: 70,
            dailyTargetCarbs_g: 260,
            waterGoalMl: 2500,
          },
          // 2026-04-10T21:30Z — це вже 2026-04-11 у Kyiv (UTC+3 влітку).
          // Саме на цьому прикладі UTC-версія backfill-у дала б інший день.
          meals: ["2026-04-10T21:30:00Z", "2026-05-02T09:00:00Z"],
        },
        {
          // Дефолтні prefs: цілі немає, але waterGoalMl = 2000 у всіх.
          id: "u-no-goal",
          prefs: { dailyTargetKcal: null, waterGoalMl: 2000 },
          meals: ["2026-04-01T09:00:00Z"],
        },
      ]);

      await apply087(pool);

      const withGoal = await periodsOf(pool, "u-with-goal");
      expect(withGoal).toHaveLength(1);
      expect(withGoal[0]!.origin).toBe("backfill");
      expect(withGoal[0]!.effective_from).toBe("2026-04-11");

      // Юзер без цілі рядка НЕ отримує — інакше backfill вигадав би ціль
      // 2000 мл води як «ціль КБЖВ» для всіх, хто її ніколи не ставив.
      expect(await periodsOf(pool, "u-no-goal")).toHaveLength(0);
    },
    TIMEOUT_MS,
  );

  it(
    "числові поля коерсяться в number (Hard Rule #1)",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      await applyForwardExcept087(pool);
      await seed(pool, [
        {
          id: "u-nums",
          prefs: {
            dailyTargetKcal: 2400,
            dailyTargetProtein_g: 150.5,
            waterGoalMl: 2500,
          },
          meals: ["2026-04-10T09:00:00Z"],
        },
      ]);
      await apply087(pool);

      const [row] = await periodsOf(pool, "u-nums");
      // INTEGER/REAL повертаються драйвером `pg` як number (на відміну від
      // BIGINT/NUMERIC, які приходять рядком) — саме тому колонки оголошені
      // INTEGER/REAL, а не BIGINT/NUMERIC: серіалізатор не мусить нічого
      // коерсити руками.
      expect(typeof row!.kcal).toBe("number");
      expect(typeof row!.protein_g).toBe("number");
      expect(typeof row!.water_ml).toBe("number");
      expect(row!.kcal).toBe(2400);
      expect(row!.water_ml).toBe(2500);
    },
    TIMEOUT_MS,
  );

  it(
    "повторний прогін НЕ дублює рядок (Coolify може ретраїти pre-deploy)",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      await applyForwardExcept087(pool);
      await seed(pool, [
        {
          id: "u-retry",
          prefs: { dailyTargetKcal: 1800, waterGoalMl: 2000 },
          meals: ["2026-04-10T09:00:00Z"],
        },
      ]);

      await apply087(pool);
      await apply087(pool);
      await apply087(pool);

      expect(await periodsOf(pool, "u-retry")).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  it(
    "не чіпає юзера, у якого період уже прийшов з клієнта",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      await applyForwardExcept087(pool);
      await seed(pool, [
        {
          id: "u-client-first",
          prefs: { dailyTargetKcal: 1800, waterGoalMl: 2000 },
          meals: ["2026-04-10T09:00:00Z"],
        },
      ]);
      await apply087(pool);
      // Симулюємо пристрій, що вже засинхронив справжню сходинку, і
      // прибираємо backfill-рядок — далі міграція має мовчати назавжди.
      await pool.query(
        `DELETE FROM nutrition_goal_periods WHERE user_id = 'u-client-first'`,
      );
      await pool.query(
        `INSERT INTO nutrition_goal_periods
           (id, user_id, effective_from, kcal, origin)
         VALUES ('gp::real', 'u-client-first', '2026-05-01', 1700, 'manual')`,
      );

      await apply087(pool);

      const rows = await periodsOf(pool, "u-client-first");
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe("gp::real");
      expect(rows[0]!.origin).toBe("manual");
    },
    TIMEOUT_MS,
  );

  it(
    "падає назад на дату prefs, коли їжі немає, і переживає сміття в JSONB",
    async (ctx) => {
      if (!dockerAvailable || !pool) return ctx.skip();
      await applyForwardExcept087(pool);
      await seed(pool, [
        {
          id: "u-no-meals",
          prefs: { dailyTargetKcal: 2000, waterGoalMl: 2000 },
          meals: [],
        },
        {
          // Відкритий блоб: історично сюди міг лягти рядок. Голий cast
          // поклав би всю міграцію на 22P02 через одного такого юзера.
          id: "u-garbage",
          prefs: {
            dailyTargetKcal: 2100,
            dailyTargetProtein_g: "не число",
            waterGoalMl: 2000,
          },
          meals: [],
        },
      ]);

      await apply087(pool);

      const [noMeals] = await periodsOf(pool, "u-no-meals");
      // prefs.created_at = 2026-03-01T10:00Z → 2026-03-01 у Kyiv.
      expect(noMeals!.effective_from).toBe("2026-03-01");

      const [garbage] = await periodsOf(pool, "u-garbage");
      expect(garbage!.kcal).toBe(2100);
      expect(garbage!.protein_g).toBeNull();
    },
    TIMEOUT_MS,
  );
});
