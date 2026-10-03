// Гейт на міграцію 153: runtime-роль `sergeant_app` має рівно ті права, які
// потрібні застосунку, і НЕ обходить RLS.
//
// Чому це тест, а не лише рунбук: політики Стадії 4 діють лише на роль без
// SUPERUSER/BYPASSRLS. Якщо хтось змінить роль (або гранти) так, що вона знову
// суперюзер чи втратить доступ до нових таблиць, RLS мовчки стане no-op, або
// прод упаде на `permission denied` у найгірший момент. Живий лейн скіпається
// без Docker.

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { APP_ROLE_NAME, buildAppRoleUri, enableAppRole } from "./appRole.js";
import {
  INTEGRATION_TIMEOUT_MS,
  bootIntegrationHarness,
  shutdownIntegrationHarness,
} from "./createIntegrationApp.js";
import type { IntegrationHarness } from "./createIntegrationApp.js";

let harness: IntegrationHarness | null = null;
let admin: pg.Pool | null = null;
let app: pg.Pool | null = null;
const prevFlag = process.env["SERGEANT_TEST_APP_ROLE"];

/** Ті самі сигнатури, що й у `nutrition-backup.integration.test.ts`. */
function isDockerUnavailableError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return (
    /could not find a working container runtime strategy/i.test(message) ||
    /cannot connect to the docker daemon/i.test(message) ||
    /is the docker daemon running/i.test(message) ||
    /docker\.sock/i.test(message) ||
    (/ENOENT/.test(message) && /docker/i.test(message))
  );
}

beforeAll(async () => {
  try {
    process.env["SERGEANT_TEST_APP_ROLE"] = "1";
    harness = await bootIntegrationHarness({ app: false });
    admin = harness.pool;
    app = new pg.Pool({
      connectionString: buildAppRoleUri(harness.connectionUri),
      max: 2,
    });
  } catch (e) {
    // Скіпаємо лише «немає Docker локально». Збій міграції чи видачі ролі —
    // справжня регресія, і тест мусить упасти, а не тихо позеленіти.
    if (process.env["CI"] || !isDockerUnavailableError(e)) throw e;
    console.warn(
      `[appRole] Skipping live lane: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await app?.end().catch(() => {});
  await shutdownIntegrationHarness();
  if (prevFlag === undefined) delete process.env["SERGEANT_TEST_APP_ROLE"];
  else process.env["SERGEANT_TEST_APP_ROLE"] = prevFlag;
}, INTEGRATION_TIMEOUT_MS);

/** Код помилки pg або `ok`. */
async function outcome(p: pg.Pool, sql: string): Promise<string> {
  try {
    await p.query(sql);
    return "ok";
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
}

describe("міграція 153 - роль sergeant_app", () => {
  it("enableAppRole без прапорця нічого не робить", async () => {
    if (!admin || !harness) return;
    const saved = process.env["DATABASE_URL"];
    process.env["SERGEANT_TEST_APP_ROLE"] = "0";
    try {
      expect(await enableAppRole(admin, harness.connectionUri)).toBeUndefined();
      expect(process.env["DATABASE_URL"]).toBe(saved);
    } finally {
      process.env["SERGEANT_TEST_APP_ROLE"] = "1";
    }
  });

  it("роль не суперюзер і не обходить RLS", async () => {
    if (!app) return;
    const { rows } = await app.query(
      `SELECT r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
    expect((await app.query(`SELECT current_user AS u`)).rows[0].u).toBe(
      APP_ROLE_NAME,
    );
  });

  it("DML працює на наявній таблиці", async () => {
    if (!admin || !app) return;
    await admin.query(
      `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
       VALUES ('role-u1', 'role-u1@test.local', 'u1', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
    );
    await app.query(`UPDATE "user" SET name = 'u1b' WHERE id = 'role-u1'`);
    const sel = await app.query(`SELECT name FROM "user" WHERE id = 'role-u1'`);
    expect(sel.rows[0].name).toBe("u1b");
    await app.query(
      `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
       VALUES ('role-u2', 'role-u2@test.local', 'u2', true, NOW(), NOW())`,
    );
    await app.query(`DELETE FROM "user" WHERE id IN ('role-u1', 'role-u2')`);
  });

  it("таблиця, створена суперюзером ПІСЛЯ 153, теж доступна (default privileges)", async () => {
    if (!admin || !app) return;
    await admin.query(
      `CREATE TABLE after_153_probe (id SERIAL PRIMARY KEY, v TEXT)`,
    );
    try {
      await app.query(`INSERT INTO after_153_probe (v) VALUES ('a')`);
      await app.query(`UPDATE after_153_probe SET v = 'b'`);
      expect((await app.query(`SELECT v FROM after_153_probe`)).rows[0].v).toBe(
        "b",
      );
      await app.query(`DELETE FROM after_153_probe`);
    } finally {
      await admin.query(`DROP TABLE after_153_probe`);
    }
  });

  it("schema_migrations: SELECT можна, запис заборонено", async () => {
    if (!admin || !app) return;
    // Гарнес не створює леджер сам (це робить раннер) - заводимо як раннер.
    await admin.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    );
    // Міграція 153 вже відпрацювала до появи леджера, тож гранти ставить
    // той самий REVOKE-блок, який раннер на проді застосовує до наявної
    // таблиці: відтворюємо його явно.
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON schema_migrations TO ${APP_ROLE_NAME}`,
    );
    const mig = await import("node:fs/promises").then((f) =>
      f.readFile(
        new URL("../migrations/153_sergeant_app_role.sql", import.meta.url),
        "utf8",
      ),
    );
    await admin.query(mig); // повторний прогін ідемпотентний і знімає запис
    expect(await outcome(app, `SELECT count(*) FROM schema_migrations`)).toBe(
      "ok",
    );
    expect(
      await outcome(app, `INSERT INTO schema_migrations (name) VALUES ('x')`),
    ).toBe("42501");
    expect(await outcome(app, `DELETE FROM schema_migrations`)).toBe("42501");
  });

  it("DDL заборонено: CREATE TABLE, TRUNCATE, CREATE EXTENSION", async () => {
    if (!admin || !app) return;
    expect(await outcome(app, `CREATE TABLE ddl_probe (id int)`)).toBe("42501");
    expect(await outcome(app, `TRUNCATE "user" CASCADE`)).toBe("42501");
    expect(await outcome(app, `CREATE EXTENSION IF NOT EXISTS pgcrypto`)).toBe(
      "42501",
    );
  });

  it("sequences і функції працюють (nextval, advisory lock, temp)", async () => {
    if (!app) return;
    expect(
      await outcome(app, `SELECT pg_advisory_xact_lock(hashtext('probe'))`),
    ).toBe("ok");
    expect(await outcome(app, `SELECT gen_random_uuid()`)).toBe("ok");
    // CREATE TEMP TABLE у рантаймі немає; фіксуємо фактичний стан як
    // документацію: TEMP на БД у PUBLIC за замовчуванням.
    expect(await outcome(app, `CREATE TEMP TABLE temp_probe (id int)`)).toBe(
      "ok",
    );
  });
});
