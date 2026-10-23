/**
 * priv-12: GDPR-експорт віддає первинні записи поза чотирма модулями і не
 * віддає шифротекст та токени.
 *
 * Фейкова БД тут не заглушка з одним рядком, а мінімальний «SQL-проєктор»:
 * вона зберігає рядки з УСІМА колонками (включно з секретами), а на запит
 * повертає лише колонки, які назвав `SELECT`. Тому тест на шифротекст
 * справді перевіряє список колонок у запиті: `SELECT *` або зайва колонка
 * віддали б маркер секрету у файл.
 */
import { describe, expect, it } from "vitest";
import { MeExportResponseSchema } from "@sergeant/shared";
import { buildMeExport } from "./dataRights.js";
import {
  EXPORT_EXCLUSIONS,
  EXPORT_EXPLICIT_TABLES,
  MODULE_EXPORT_TABLES,
} from "./exportBuilder.js";

type Row = Record<string, unknown>;

const USER = {
  id: "user-A",
  email: "a@example.com",
  name: "A",
  image: null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z",
} as const;

const SECRET = "SECRET_MARKER_DO_NOT_EXPORT";

function fakeDb(tables: Record<string, Row[]>) {
  const executed: string[] = [];
  const ownerOf = (table: string, row: Row): unknown => {
    if ("user_id" in row) return row["user_id"];
    // Таблиці без власного `user_id`: людина визначається через батьківський чек.
    if (table === "receipt_items" || table === "finyk_tx_receipt_links") {
      return (tables["receipts"] ?? []).find(
        (r) => r["id"] === row["receipt_id"],
      )?.["user_id"];
    }
    return undefined;
  };
  return {
    executed,
    query: (sql: string, params: unknown[] = []) => {
      const text = String(sql).replace(/\s+/g, " ").trim();
      executed.push(text);
      const match = /^SELECT (.+?) FROM ([a-z_]+)(?: ([a-z]\b))?/i.exec(text);
      if (!match) return Promise.resolve({ rows: [] });
      const [, colList, table, alias] = match as unknown as [
        string,
        string,
        string,
        string | undefined,
      ];
      const stored = tables[table] ?? [];
      const wantSoftDeleteFilter = /deleted_at IS NULL/.test(text);
      const rows = stored
        .filter((row) => ownerOf(table, row) === params[0])
        .filter((row) => !wantSoftDeleteFilter || row["deleted_at"] == null)
        .map((row) => {
          const cols = colList.split(",").map((c) => c.trim());
          if (cols.some((c) => c === "*" || c === `${alias}.*`))
            return { ...row };
          const out: Row = {};
          for (const col of cols) {
            const name = col.replace(/^[a-z]\./, "");
            if (name in row) out[name] = row[name];
          }
          return out;
        });
      return Promise.resolve({ rows });
    },
  };
}

// Фейк має форму `Queryable`, але типізувати його під `pg` ціною не варте.
const build = (db: ReturnType<typeof fakeDb>) =>
  buildMeExport(db as never, USER);

const T0 = new Date("2026-06-01T10:00:00.000Z");

function seed(): Record<string, Row[]> {
  return {
    user_profile: [
      {
        user_id: "user-A",
        payload: { biometrics: { heightCm: 181, weightKg: 79 } },
        updated_at: T0,
      },
      {
        user_id: "user-B",
        payload: { biometrics: { heightCm: 999 } },
        updated_at: T0,
      },
    ],
    receipts: [
      {
        id: "23", // BIGSERIAL приходить з pg рядком
        user_id: "user-A",
        source: "dps",
        fiscal_num: "FN-1",
        store_name: "Крамниця",
        store_tax_id: null,
        purchased_at: T0,
        total_kopiykas: "12550",
        raw_payload: { lines: 2 },
        created_at: T0,
        updated_at: T0,
      },
      {
        id: "99",
        user_id: "user-B",
        source: "dps",
        store_name: "Чужа",
        purchased_at: T0,
        total_kopiykas: "1",
        raw_payload: {},
        created_at: T0,
        updated_at: T0,
      },
    ],
    receipt_items: [
      {
        id: "5",
        receipt_id: "23",
        position: 1,
        name: "Хліб",
        qty: "1.500",
        price_kopiykas: "2000",
        sum_kopiykas: "3000",
        created_at: T0,
      },
      {
        id: "6",
        receipt_id: "99",
        position: 1,
        name: "Чужий товар",
        qty: "1",
        price_kopiykas: "1",
        sum_kopiykas: "1",
        created_at: T0,
      },
    ],
    finyk_tx_receipt_links: [
      { receipt_id: "23", tx_kind: "mono", tx_ref: "tx-1", created_at: T0 },
    ],
    privat_connection: [
      {
        user_id: "user-A",
        merchant_id: "M-1",
        token_ciphertext: `${SECRET}_PRIVAT_CT`,
        token_iv: `${SECRET}_PRIVAT_IV`,
        token_tag: `${SECRET}_PRIVAT_TAG`,
        token_key_version: 1,
        token_fingerprint: "fp-privat",
        created_at: T0,
        updated_at: T0,
      },
    ],
    silpo_connection: [
      {
        user_id: "user-A",
        access_token_ciphertext: `${SECRET}_SILPO_ACT`,
        access_token_iv: `${SECRET}_SILPO_AIV`,
        access_token_tag: `${SECRET}_SILPO_ATAG`,
        refresh_token_ciphertext: `${SECRET}_SILPO_RCT`,
        refresh_token_iv: `${SECRET}_SILPO_RIV`,
        refresh_token_tag: `${SECRET}_SILPO_RTAG`,
        token_key_version: 1,
        access_token_expires_at: T0,
        last_sync_at: T0,
        status: "connected",
        last_failed_at: null,
        last_error_code: null,
        pantry_auto_import_since: null,
        created_at: T0,
        updated_at: T0,
      },
    ],
    silpo_receipts: [
      {
        user_id: "user-A",
        receipt_id: "s-1",
        purchased_at: T0,
        store_id: "st",
        channel: "online",
        payment_hint: null,
        total_kop: "9900",
        raw: { a: 1 },
        pantry_auto_declined_at: null,
        created_at: T0,
      },
    ],
    silpo_receipt_items: [
      {
        id: "1",
        user_id: "user-A",
        receipt_id: "s-1",
        name: "Молоко",
        qty: "2",
        unit: "шт",
        price_kop: "4950",
        category_slug: null,
        barcode: null,
        pantry_claimed_at: null,
        created_at: T0,
      },
    ],
    mono_jar: [
      {
        user_id: "user-A",
        mono_jar_id: "j-1",
        send_id: null,
        title: "На відпустку",
        description: null,
        currency_code: 980,
        balance: "150000",
        goal: null,
        last_seen_at: T0,
      },
    ],
    import_batches: [
      {
        id: "3",
        user_id: "user-A",
        source: "csv",
        file_hash: null,
        status: "completed",
        rows_total: 2,
        rows_created: 2,
        rows_linked: 0,
        rows_skipped: 0,
        created_row_ids: ["a", "b"],
        created_at: T0,
        updated_at: T0,
      },
    ],
    feedback_entries: [
      {
        id: "7",
        user_id: "user-A",
        category: "idea",
        message: "FEEDBACK_PROBE",
        page: null,
        viewport: null,
        user_agent: "UA",
        app_env: null,
        created_at: T0,
      },
    ],
    email_unsubscribes: [
      {
        id: "2",
        user_id: "user-A",
        campaign_family: "drip",
        unsubscribed_at: T0,
        source: "email_footer",
      },
    ],
    waitlist_entries: [
      {
        id: "4",
        user_id: "user-A",
        email: "a@example.com",
        tier_interest: "pro",
        source: "pricing_page",
        locale: "uk",
        user_agent: null,
        created_at: T0,
        notified_at: null,
      },
    ],
  };
}

describe("buildMeExport: первинні записи поза чотирма модулями (priv-12)", () => {
  it("профіль і чеки з позиціями потрапляють у файл", async () => {
    const result = await build(fakeDb(seed()));

    expect(result.data.profile).toMatchObject({
      payload: { biometrics: { heightCm: 181, weightKg: 79 } },
    });
    expect(result.data.finyk["receipts"]).toHaveLength(1);
    expect(result.data.finyk["receipts"]?.[0]).toMatchObject({
      store_name: "Крамниця",
      fiscal_num: "FN-1",
    });
    expect(result.data.finyk["receipt_items"]).toHaveLength(1);
    expect(result.data.finyk["receipt_items"]?.[0]).toMatchObject({
      name: "Хліб",
    });
    expect(result.data.finyk["import_batches"]).toHaveLength(1);
    expect(result.data.feedback[0]).toMatchObject({
      message: "FEEDBACK_PROBE",
    });
    expect(result.data.emailUnsubscribes).toHaveLength(1);
    expect(result.data.waitlist).toHaveLength(1);
    expect(result.data.mono.jars).toHaveLength(1);
    expect(result.data.silpo.receipts).toHaveLength(1);
    expect(result.data.silpo.receiptItems).toHaveLength(1);
    expect(result.data.privat.connection).toMatchObject({
      token_fingerprint: "fp-privat",
    });
    expect(result.data.silpo.connection).toMatchObject({ status: "connected" });
    // Роут віддає `MeExportResponseSchema.parse(...)`, а zod мовчки відкидає
    // невідомі ключі: нова секція, якої нема в схемі, зникла б з відповіді.
    const parsed = MeExportResponseSchema.parse(result);
    expect(parsed.data.profile).toEqual(result.data.profile);
    expect(parsed.data.silpo).toEqual(result.data.silpo);
    expect(parsed.data.privat).toEqual(result.data.privat);
    expect(parsed.data.feedback).toEqual(result.data.feedback);
    expect(parsed.data.finyk["receipts"]).toEqual(
      result.data.finyk["receipts"],
    );
  });

  it("аватар їде в файл як base64, що декодується в ті самі байти (ux-14)", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const tables = seed();
    tables["user_avatars"] = [
      {
        user_id: "user-A",
        content_type: "image/jpeg",
        data: bytes,
        updated_at: T0,
      },
      {
        user_id: "user-B",
        content_type: "image/png",
        data: Buffer.from("other"),
        updated_at: T0,
      },
    ];
    const result = await build(fakeDb(tables));

    const avatar = result.data.avatar;
    expect(avatar).not.toBeNull();
    expect(avatar?.mimeType).toBe("image/jpeg");
    expect(avatar?.updatedAt).toBe(T0.toISOString());
    expect(Buffer.from(avatar?.dataBase64 ?? "", "base64")).toEqual(bytes);
    expect(() => MeExportResponseSchema.parse(result)).not.toThrow();
    expect(EXPORT_EXCLUSIONS.flatMap((e) => e.tables)).not.toContain(
      "user_avatars",
    );
  });

  it("без аватара поле avatar дорівнює null", async () => {
    const result = await build(fakeDb(seed()));
    expect(result.data.avatar).toBeNull();
  });

  it("нічого з даних іншої людини не потрапляє у файл", async () => {
    const json = JSON.stringify(await build(fakeDb(seed())));
    expect(json).not.toContain("Чужа");
    expect(json).not.toContain("Чужий товар");
    expect(json).not.toContain('"heightCm":999');
  });

  it("шифротекст і токени privat_connection та silpo_connection не потрапляють у файл", async () => {
    const result = await build(fakeDb(seed()));
    const json = JSON.stringify(result);

    expect(json).not.toContain(SECRET);

    const forbidden =
      /ciphertext|_iv$|_tag$|token_key_version|^access_token$|^refresh_token$/;
    for (const connection of [
      result.data.privat.connection,
      result.data.silpo.connection,
    ]) {
      expect(connection).not.toBeNull();
      const leaked = Object.keys(connection ?? {}).filter((key) =>
        forbidden.test(key),
      );
      expect(leaked).toEqual([]);
    }
  });

  it("BIGINT і NUMERIC приходять числами, а не рядками (Hard Rule #1)", async () => {
    const { data } = await build(fakeDb(seed()));

    expect(data.finyk["receipts"]?.[0]).toMatchObject({
      id: 23,
      total_kopiykas: 12550,
    });
    expect(data.finyk["receipt_items"]?.[0]).toMatchObject({
      id: 5,
      receipt_id: 23,
      qty: 1.5,
      price_kopiykas: 2000,
      sum_kopiykas: 3000,
    });
    // Посилання на чек має той самий тип id, що й сам чек.
    expect(data.finyk["finyk_tx_receipt_links"]?.[0]).toMatchObject({
      receipt_id: 23,
    });
    expect(data.finyk["import_batches"]?.[0]).toMatchObject({ id: 3 });
    expect(data.mono.jars[0]).toMatchObject({ balance: 150000, goal: null });
    expect(data.silpo.receipts[0]).toMatchObject({ total_kop: 9900 });
    expect(data.silpo.receiptItems[0]).toMatchObject({
      id: 1,
      qty: 2,
      price_kop: 4950,
    });
    expect(data.feedback[0]).toMatchObject({ id: 7 });
  });

  it("кожна таблиця з EXPORT_EXPLICIT_TABLES справді читається запитом", async () => {
    const db = fakeDb(seed());
    await build(db);

    const missing = EXPORT_EXPLICIT_TABLES.filter(
      (table) =>
        !db.executed.some((sql) =>
          new RegExp(`\\b(FROM|JOIN) ${table}\\b`).test(sql),
        ),
    );
    expect(missing).toEqual([]);
  });

  it("жоден запит поза модульним шляхом не бере всі колонки через *", async () => {
    const db = fakeDb(seed());
    await build(db);

    const moduleTables = new Set<string>(
      Object.values(MODULE_EXPORT_TABLES).flat(),
    );
    const wildcard = db.executed.filter((sql) => {
      if (!/\*/.test(sql)) return false;
      const table = /\bFROM ([a-z_]+)/i.exec(sql)?.[1] ?? "";
      // `SELECT * FROM <module table>` – модульний шлях із allowlist-ом;
      // `l.*` – `finyk_tx_receipt_links`, у якій немає секретів.
      return !moduleTables.has(table) && table !== "finyk_tx_receipt_links";
    });
    expect(wildcard).toEqual([]);
  });

  it("таблиця не може бути одночасно у файлі й у виключеннях", () => {
    const moduleTables = new Set<string>([
      ...Object.values(MODULE_EXPORT_TABLES).flat(),
      ...EXPORT_EXPLICIT_TABLES,
    ]);
    const both = EXPORT_EXCLUSIONS.flatMap((e) => e.tables).filter((t) =>
      moduleTables.has(t),
    );
    expect(both).toEqual([]);
  });
});
