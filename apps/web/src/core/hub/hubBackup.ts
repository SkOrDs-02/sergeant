import type { DualWriteOutcome } from "@sergeant/dualwrite-core";
import {
  BACKUP_NEWER_VERSION_MESSAGE,
  BACKUP_RESTORE_NOT_READY_MESSAGE,
  BACKUP_RESTORE_SYNC_PENDING_MESSAGE,
  type BackupRestoreMode,
} from "@shared/lib/backup/restoreMode";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { isDualWriteOutcomeClean } from "../durability/dualWriteJournal";
import {
  getHubRestoreModuleBlock,
  type HubRestoreModule,
} from "./hubBackupReadiness";
import {
  normalizeFinykBackup,
  readFinykBackupFromStorage,
  persistFinykNormalizedToStorage,
  persistFinykNormalizedToSqlite,
} from "../../modules/finyk/lib/finykBackup";
import {
  buildFizrukFullBackupPayload,
  applyFizrukFullBackupPayload,
  validateFizrukFullBackupPayload,
} from "../../modules/fizruk/lib/fizrukStorage";
import {
  buildRoutineBackupPayload,
  applyRoutineBackupPayload,
  validateRoutineBackupPayload,
} from "../../modules/routine/lib/routineStorage";
import { routineDualWriteIdle } from "../../modules/routine/lib/sqliteWriter/index";
import { nutritionDualWriteIdle } from "../../modules/nutrition/lib/sqliteWriter/index";
import {
  applyNutritionBackupPayload,
  buildNutritionBackupPayload,
  validateNutritionBackupPayload,
} from "../../modules/nutrition/domain/nutritionBackup";
import { applyNutritionBackupFoods } from "../../modules/nutrition/domain/nutritionBackupFoods";
import { isHubModuleId } from "@shared/lib/modules/hubNav";

const HUB_MODULE_KEY = "hub_last_module";
const HUB_CHAT_KEY = "hub_chat_history";

export const HUB_BACKUP_KIND = "hub-backup";
export const HUB_BACKUP_SCHEMA_VERSION = 1;

/**
 * Audit 03 F20 (security/PII): the per-module backup shapes carry
 * Better-Auth opaque user IDs and Monobank account UUIDs that identify the
 * person, not the data. The exported JSON lands in `Downloads`, gets
 * forwarded to support, screen-shared, or synced to a personal cloud — so we
 * strip the identity fields before serialisation while keeping the financial
 * / fitness / habit data that the user actually wants to restore.
 *
 * Free-form strings the user typed themselves (debt titles like
 * "Іван Петрович — позика") are intentionally *not* redacted — that is the
 * user's own content and removing it would break the restore. The panel copy
 * now discloses that such free-text may contain PII (see `HubBackupPanel`).
 *
 * Matching is by key name (case-insensitive), recursive over objects and
 * arrays. We match the identity keys (`userId`, `accountId`, `ownerId`, …) but
 * deliberately keep domain-record ids (`id`, `txId`, `habitId`) so referential
 * integrity inside the backup survives a round-trip.
 */
const PII_KEY_RE =
  /^(_?)(user|owner|account|customer|client|device|session|auth)_?id$/i;

/**
 * Recursively drop identity-shaped keys (exported for unit coverage —
 * audit 03 F20). Domain record ids (`id`, `txId`, `habitId`) are kept so the
 * backup stays referentially consistent across a round-trip.
 */
function redactPiiValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => redactPiiValue(v));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEY_RE.test(k)) continue;
      out[k] = redactPiiValue(v);
    }
    return out;
  }
  return value;
}

export function redactPii<T>(value: T): T {
  return redactPiiValue(value) as T;
}

interface HubBackupOptions {
  includeChat?: boolean;
}

interface HubBackupPayload {
  kind: typeof HUB_BACKUP_KIND;
  schemaVersion: number;
  exportedAt: string;
  finyk: unknown;
  fizruk: unknown;
  routine: unknown;
  nutrition: unknown;
  hub?:
    | { lastModule?: string | undefined; chatHistory?: string | undefined }
    | undefined;
}

export function buildHubBackupPayload(
  options: HubBackupOptions = {},
): HubBackupPayload {
  const { includeChat = false } = options;
  let finyk;
  try {
    finyk = normalizeFinykBackup(readFinykBackupFromStorage());
  } catch {
    finyk = {};
  }
  const hub: Record<string, string> = {};
  const m = safeReadStringLS(HUB_MODULE_KEY);
  if (m) hub["lastModule"] = m;
  if (includeChat) {
    const chat = safeReadStringLS(HUB_CHAT_KEY);
    if (chat) hub["chatHistory"] = chat;
  }
  return {
    kind: HUB_BACKUP_KIND,
    schemaVersion: HUB_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    // Audit 03 F20: strip identity fields (userId / accountId / …) from every
    // module payload before it leaves the app. `hub` only holds the last-module
    // string + opt-in chat history, so it does not need the pass.
    finyk: redactPii(finyk),
    fizruk: redactPii(buildFizrukFullBackupPayload()),
    routine: redactPii(buildRoutineBackupPayload()),
    nutrition: redactPii(buildNutritionBackupPayload()),
    hub: Object.keys(hub).length ? hub : undefined,
  };
}

export function isHubBackupPayload(
  parsed: unknown,
): parsed is HubBackupPayload {
  return hubBackupRejectReason(parsed) === null;
}

/**
 * Людський текст відмови для файлу, який не є бекапом Hub цієї версії, або
 * `null`, коли файл прийнятний. Файл новішої версії (`schemaVersion` більший
 * за `HUB_BACKUP_SCHEMA_VERSION`) відхиляється окремим текстом: читати його
 * «по-старому» означало б мовчки втратити чи зіпсувати невідомі поля (аудит
 * 2026-10-01, data-34).
 */
export function hubBackupRejectReason(parsed: unknown): string | null {
  if (
    parsed == null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>)["kind"] !== HUB_BACKUP_KIND
  ) {
    return "Некоректний файл резервної копії Hub.";
  }
  const version = (parsed as Record<string, unknown>)["schemaVersion"];
  if (typeof version !== "number") {
    return "Некоректний файл резервної копії Hub.";
  }
  if (version > HUB_BACKUP_SCHEMA_VERSION) return BACKUP_NEWER_VERSION_MESSAGE;
  return null;
}

/** Кидає з людським текстом, якщо файл не бекап Hub цієї версії. */
export function assertHubBackupPayload(
  parsed: unknown,
): asserts parsed is HubBackupPayload {
  const reason = hubBackupRejectReason(parsed);
  if (reason !== null) throw new Error(reason);
}

/** Модуль → назва для тексту помилки відновлення. */
const RESTORE_MODULE_LABELS: Record<HubRestoreModule, string> = {
  finyk: "Фініка",
  fizruk: "Фізрука",
  routine: "Рутини",
  nutrition: "Їжі",
};

/**
 * Restore не має права звітувати про успіх, якщо запис не відбувся.
 * `skipped` (контекст не зареєстрований, SQLite недоступна) і `applied` з
 * помилками (`errored > 0`) кидають; `no-ops` — це «нічого додавати», тож не
 * помилка (аудит 2026-10-01, data-07: `skipped` ігнорувався, а UI робив
 * reload як при успіху).
 */
function assertRestoreWritten(
  module: HubRestoreModule,
  outcome: DualWriteOutcome,
): void {
  if (outcome.status === "skipped" && outcome.reason === "no-ops") return;
  if (isDualWriteOutcomeClean(outcome)) return;
  const label = RESTORE_MODULE_LABELS[module];
  throw new Error(
    outcome.status === "skipped"
      ? `Не вдалось записати дані ${label}: сховище поки недоступне. Спробуй ще раз.`
      : `Частина даних ${label} не записалась. Спробуй ще раз.`,
  );
}

function assertModuleReady(module: HubRestoreModule): void {
  const block = getHubRestoreModuleBlock(module);
  if (block === null) return;
  throw new Error(
    block === "sync"
      ? BACKUP_RESTORE_SYNC_PENDING_MESSAGE
      : BACKUP_RESTORE_NOT_READY_MESSAGE,
  );
}

/**
 * Секція Фініка до запису: `null`, коли в ній немає даних (порожній обʼєкт або
 * лише `version`), інакше нормалізований бекап. Кидає на битій секції.
 */
function prepareFinykSection(
  section: unknown,
): ReturnType<typeof normalizeFinykBackup> | null {
  if (!section || typeof section !== "object") return null;
  const keys = Object.keys(section).filter((k) => k !== "version");
  if (keys.length === 0) return null;
  const withVer = "version" in section ? section : { ...section, version: 1 };
  return normalizeFinykBackup(withVer);
}

export interface ApplyHubBackupOptions {
  /**
   * `merge` (дефолт): лише додати відсутнє, нічого не видаляючи на пристрої й
   * на сервері. `replace`: усе, чого немає у файлі, видаляється і на інших
   * пристроях акаунта (див. `BackupRestoreMode`). Аудит 2026-10-01, data-06.
   */
  mode?: BackupRestoreMode;
}

/**
 * Async because Фінік і Фізрук пишуть у SQLite, а не в LS (див. AI-DANGER у
 * `modules/finyk/lib/finykBackup.ts`). Виклик ОБОВʼЯЗКОВО чекати перед
 * `window.location.reload()`, інакше перезавантаження вбʼє запис; а ще перед
 * reload треба дочекатись `outboxCheckpoint()` (це робить `HubBackupPanel`).
 *
 * Кидає, якщо потрібний модуль не готовий (контекст не зареєстрований чи кеш
 * холодний) або запис не відбувся: тихого успіху немає.
 *
 * Два етапи (аудит 2026-10-01, data-34): спершу всі присутні секції
 * перевіряються й нормалізуються без запису, і готовність усіх модулів, лише
 * потім ідуть записи. Битий пізніший модуль більше не лишає Фінік записаним.
 * Міжмодульного відкату немає: збій самого запису (квота сховища) пізнішого
 * модуля все ще лишає раніші записаними.
 */
export async function applyHubBackupPayload(
  parsed: unknown,
  { mode = "merge" }: ApplyHubBackupOptions = {},
): Promise<void> {
  assertHubBackupPayload(parsed);
  // Фаза 1 «validate all»: кожна присутня секція нормалізується й
  // перевіряється БЕЗ запису. Інакше Фінік уже був би записаний (і поставлений
  // у синк), коли пізніший модуль відхиляє свою секцію: стан «наполовину» не
  // відкотити (аудит 2026-10-01, data-34).
  const finykNormalized = prepareFinykSection(parsed.finyk);
  if (parsed.routine) validateRoutineBackupPayload(parsed.routine);
  if (parsed.fizruk) validateFizrukFullBackupPayload(parsed.fizruk);
  if (parsed.nutrition) validateNutritionBackupPayload(parsed.nutrition);
  // Готовність теж для всіх секцій наперед: не готовий пізніший модуль не
  // має лишати раніший уже записаним.
  if (finykNormalized) assertModuleReady("finyk");
  if (parsed.routine) assertModuleReady("routine");
  if (parsed.fizruk) assertModuleReady("fizruk");
  if (parsed.nutrition) assertModuleReady("nutrition");

  // Фаза 2: записи в тому самому порядку, що й раніше.
  if (finykNormalized) {
    // LS-ключі Фініка читає лише холодний кеш, а імпорт вимагає теплого, тож
    // у `merge` їх не чіпаємо: писати туди файл як є означало б затерти
    // поточне, а не додати відсутнє.
    if (mode === "replace") persistFinykNormalizedToStorage(finykNormalized);
    assertRestoreWritten(
      "finyk",
      await persistFinykNormalizedToSqlite(finykNormalized, mode),
    );
  }
  if (parsed.routine) {
    // Рутина й Їжа пишуть у SQLite fire-and-forget, а виклик цієї
    // функції закінчується `window.location.reload()` — без drain-у
    // перезавантаження обриває запис до першого SQL.
    applyRoutineBackupPayload(parsed.routine, mode);
    await routineDualWriteIdle();
  }
  if (parsed.fizruk) {
    assertRestoreWritten(
      "fizruk",
      await applyFizrukFullBackupPayload(parsed.fizruk, mode),
    );
  }
  if (parsed.nutrition) {
    applyNutritionBackupPayload(parsed.nutrition, mode);
    await applyNutritionBackupFoods(parsed.nutrition);
    await nutritionDualWriteIdle();
  }
  if (parsed.hub && typeof parsed.hub === "object") {
    const h = parsed.hub;
    // `merge` не перебиває те, що вже є: останній розділ і історія чату
    // ставляться лише на порожнє місце.
    if (isHubModuleId(h.lastModule)) {
      if (mode === "replace" || !safeReadStringLS(HUB_MODULE_KEY)) {
        safeWriteLS(HUB_MODULE_KEY, h.lastModule);
      }
    }
    if (typeof h.chatHistory === "string") {
      if (mode === "replace" || !safeReadStringLS(HUB_CHAT_KEY)) {
        safeWriteLS(HUB_CHAT_KEY, h.chatHistory);
      }
    }
  }
}
