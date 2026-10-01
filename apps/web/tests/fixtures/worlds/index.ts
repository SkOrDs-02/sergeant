/**
 * Світи E2E-станів. JSON тримає лише специфіку світу; серверні відповіді
 * будуються тут і типізуються контрактом `@sergeant/api-client` (Hard Rule
 * #3): новий обовʼязковий рядок у схемі ламає `typecheck`, а не тест.
 * Файл входить у `tsconfig.json` веба саме заради цього.
 */
import type {
  BillingCheckoutResponse,
  BillingStatusResponse,
  MeResponse,
  MonoAccountDto,
  MonoSyncState,
  MonoTransactionDto,
  MonoTransactionsPage,
  SilpoSyncState,
} from "@sergeant/api-client";
import type { AuthSessionResponse } from "@sergeant/shared";

import type { StatusResponse } from "../../../src/core/status/types";
import emptyWorld from "./empty.json" with { type: "json" };
import finykMonthWorld from "./finyk-month.json" with { type: "json" };
import fizrukActiveSessionWorld from "./fizruk-active-session.json" with { type: "json" };
import pantryReceiptNamesWorld from "./pantry-receipt-names.json" with { type: "json" };
import routineStreaksWorld from "./routine-streaks.json" with { type: "json" };

export type WorldId =
  | "empty"
  | "pantry-receipt-names"
  | "finyk-month"
  | "routine-streaks"
  | "fizruk-active-session";

/** Банківська операція світу. `amount` у копійках, відʼємна = витрата. */
export interface WorldMonoTransaction {
  readonly daysAgo: number;
  readonly amount: number;
  readonly mcc: number | null;
  readonly description: string;
  readonly categorySlug: string | null;
}

export interface ScenarioWorld {
  readonly version: 1;
  readonly id: WorldId;
  /** `null` = анонімний візитер, `/me` віддає 401. */
  readonly user: MeResponse["user"] | null;
  /** `null` = Monobank не підключено. */
  readonly mono: {
    readonly transactions: readonly WorldMonoTransaction[];
  } | null;
  /** `null` = Сільпо не підключено. */
  readonly silpo: { readonly receiptsCount: number } | null;
  /** Локальна частина, її парсить міст (`src/e2e/world.ts`). */
  readonly local: unknown;
}

/**
 * Користувач для світів, яким потрібна сесія. Дефолтні світи анонімні: це
 * фактичний стан лейнів до цієї роботи (колишній мок `/me` не проходив
 * `MeResponseSchema`, тож застосунок жив анонімом), а автентифікована сесія
 * будить sync-рушій і перевірки identity, яких мок-світ не обслуговує.
 */
export const QA_USER: MeResponse["user"] = {
  id: "qa-user",
  name: "QA User",
  email: "qa@example.com",
  image: null,
  emailVerified: true,
  createdAt: null,
};

const ACCOUNT_ID = "e2e-black-uah";
const DAY_MS = 86_400_000;

type Rec = Record<string, unknown>;

function asRecord(value: unknown, path: string, keys: readonly string[]): Rec {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: очікував обʼєкт`);
  }
  const unknownKey = Object.keys(value).find((key) => !keys.includes(key));
  if (unknownKey !== undefined) {
    throw new Error(`${path}: невідоме поле '${unknownKey}'`);
  }
  return value as Rec;
}

function asInt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${path}: очікував ціле число`);
  }
  return value;
}

function asNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value) {
    throw new Error(`${path}: очікував рядок або null`);
  }
  return value;
}

function parseMonoTransaction(
  value: unknown,
  path: string,
): WorldMonoTransaction {
  const r = asRecord(value, path, [
    "daysAgo",
    "amount",
    "mcc",
    "description",
    "categorySlug",
  ]);
  const daysAgo = asInt(r["daysAgo"], `${path}.daysAgo`);
  if (daysAgo < 0) throw new Error(`${path}.daysAgo: очікував >= 0`);
  return {
    daysAgo,
    amount: asInt(r["amount"], `${path}.amount`),
    mcc: r["mcc"] === null ? null : asInt(r["mcc"], `${path}.mcc`),
    description:
      asNullableString(r["description"], `${path}.description`) ?? "",
    categorySlug: asNullableString(r["categorySlug"], `${path}.categorySlug`),
  };
}

/** Парсер світу від `unknown`: невідоме поле чи чужа `version` це помилка. */
export function parseWorld(value: unknown, id: WorldId): ScenarioWorld {
  const r = asRecord(value, id, ["version", "id", "mono", "silpo", "local"]);
  if (r["version"] !== 1) {
    throw new Error(`${id}: непідтримувана version ${String(r["version"])}`);
  }
  if (r["id"] !== id) throw new Error(`${id}: id у файлі '${String(r["id"])}'`);
  let mono: ScenarioWorld["mono"] = null;
  if (r["mono"] !== undefined) {
    const m = asRecord(r["mono"], `${id}.mono`, ["transactions"]);
    const list = m["transactions"];
    if (!Array.isArray(list)) {
      throw new Error(`${id}.mono.transactions: очікував масив`);
    }
    mono = {
      transactions: list.map((tx, i) =>
        parseMonoTransaction(tx, `${id}.mono.transactions[${i}]`),
      ),
    };
  }
  let silpo: ScenarioWorld["silpo"] = null;
  if (r["silpo"] !== undefined) {
    const s = asRecord(r["silpo"], `${id}.silpo`, ["receiptsCount"]);
    silpo = {
      receiptsCount: asInt(s["receiptsCount"], `${id}.silpo.receiptsCount`),
    };
  }
  return { version: 1, id, user: null, mono, silpo, local: r["local"] };
}

const RAW: Record<WorldId, unknown> = {
  empty: emptyWorld,
  "pantry-receipt-names": pantryReceiptNamesWorld,
  "finyk-month": finykMonthWorld,
  "routine-streaks": routineStreaksWorld,
  "fizruk-active-session": fizrukActiveSessionWorld,
};

export function getWorld(id: WorldId): ScenarioWorld {
  return parseWorld(RAW[id], id);
}

// ── Серверні відповіді світу ─────────────────────────────────────────────

export function meResponse(user: MeResponse["user"]): MeResponse {
  return { user };
}

/** Better Auth `/api/auth/get-session`: `null` для анонімного світу. */
export function authSession(world: ScenarioWorld): AuthSessionResponse {
  if (!world.user) return null;
  const now = new Date().toISOString();
  return {
    user: world.user,
    session: {
      id: "e2e-session",
      userId: world.user.id,
      token: "e2e-session-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function monoSyncState(world: ScenarioWorld): MonoSyncState {
  if (!world.mono) {
    return {
      status: "disconnected",
      webhookActive: false,
      lastEventAt: null,
      lastBackfillAt: null,
      accountsCount: 0,
    };
  }
  const now = new Date().toISOString();
  return {
    status: "active",
    webhookActive: true,
    lastEventAt: now,
    lastBackfillAt: now,
    accountsCount: 1,
  };
}

export function monoAccounts(world: ScenarioWorld): MonoAccountDto[] {
  if (!world.mono) return [];
  return [
    {
      userId: world.user?.id ?? QA_USER.id,
      monoAccountId: ACCOUNT_ID,
      sendId: null,
      type: "black",
      currencyCode: 980,
      cashbackType: "UAH",
      maskedPan: ["537541******4242"],
      iban: null,
      balance: 2_450_000,
      creditLimit: 0,
      lastSeenAt: new Date().toISOString(),
    },
  ];
}

/**
 * Сторінка `/api/mono/transactions` для діапазону запиту. Операції світу
 * живуть лише в поточному місяці: `daysAgo`, що виходить за початок
 * запитаного діапазону, притискається до нього, тож місяць наповнений і
 * першого числа. Діапазон, що не містить «зараз» (історія), порожній.
 */
export function monoTransactionsPage(
  world: ScenarioWorld,
  range: { from: string | null; to: string | null },
): MonoTransactionsPage {
  const now = Date.now();
  const from = range.from ? Date.parse(range.from) : now - 31 * DAY_MS;
  const to = range.to ? Date.parse(range.to) : now;
  if (!world.mono || now < from || now > to + DAY_MS) {
    return { data: [], nextCursor: null };
  }
  const userId = world.user?.id ?? QA_USER.id;
  const data: MonoTransactionDto[] = world.mono.transactions.map((tx, i) => {
    const at = Math.max(
      from + i * 60_000,
      now - tx.daysAgo * DAY_MS - i * 60_000,
    );
    const time = new Date(Math.min(now, at)).toISOString();
    return {
      userId,
      monoAccountId: ACCOUNT_ID,
      monoTxId: `e2e-tx-${String(i).padStart(3, "0")}`,
      time,
      amount: tx.amount,
      operationAmount: tx.amount,
      currencyCode: 980,
      mcc: tx.mcc,
      originalMcc: tx.mcc,
      hold: false,
      description: tx.description,
      comment: null,
      cashbackAmount: 0,
      commissionRate: 0,
      balance: null,
      receiptId: null,
      invoiceId: null,
      counterEdrpou: null,
      counterIban: null,
      counterName: null,
      categorySlug: tx.categorySlug,
      categoryOverridden: false,
      source: "webhook",
      receivedAt: time,
    };
  });
  data.sort((a, b) => b.time.localeCompare(a.time));
  return { data, nextCursor: null };
}

export function silpoSyncState(world: ScenarioWorld): SilpoSyncState {
  if (!world.silpo) {
    return {
      status: "disconnected",
      accessTokenExpiresAt: null,
      lastSyncAt: null,
      lastFailedAt: null,
      lastErrorCode: null,
      receiptsCount: 0,
      pantryAutoImportSince: null,
    };
  }
  return {
    status: "connected",
    accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    lastSyncAt: new Date(Date.now() - DAY_MS).toISOString(),
    lastFailedAt: null,
    lastErrorCode: null,
    receiptsCount: world.silpo.receiptsCount,
    pantryAutoImportSince: null,
  };
}

const METER = { used: 0, limit: 20, resetsAt: "2099-01-01T00:00:00.000Z" };

export function billingStatus(): BillingStatusResponse {
  return {
    subscription: {
      id: null,
      provider: null,
      plan: null,
      status: null,
      active: false,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    access: {
      state: "free",
      trialEndsAt: null,
      graceEndsAt: null,
      features: {},
      meters: { aiActions: METER, aiPhoto: METER, finykVision: METER },
    },
  };
}

export function billingCheckout(url: string): BillingCheckoutResponse {
  return { ok: true, mode: "test", sessionId: "cs_test_smoke", url };
}

export function systemStatus(): StatusResponse {
  return {
    status: "operational",
    timestamp: new Date().toISOString(),
    components: [],
    lastIncident: null,
  };
}
