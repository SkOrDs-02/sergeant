import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import {
  normalizeFinykBackup,
  readFinykBackupFromStorage,
  persistFinykNormalizedToStorage,
} from "../../modules/finyk/lib/finykBackup";
import {
  buildFizrukFullBackupPayload,
  applyFizrukFullBackupPayload,
} from "../../modules/fizruk/lib/fizrukStorage";
import {
  buildRoutineBackupPayload,
  applyRoutineBackupPayload,
} from "../../modules/routine/lib/routineStorage";
import {
  applyNutritionBackupPayload,
  buildNutritionBackupPayload,
} from "../../modules/nutrition/domain/nutritionBackup";

const HUB_MODULE_KEY = "hub_last_module";
const HUB_CHAT_KEY = "hub_chat_history";
const VALID_MODULES = new Set(["finyk", "fizruk", "routine", "nutrition"]);

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
  return (
    parsed != null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>)["kind"] === HUB_BACKUP_KIND &&
    typeof (parsed as Record<string, unknown>)["schemaVersion"] === "number"
  );
}

export function applyHubBackupPayload(parsed: unknown): void {
  if (!isHubBackupPayload(parsed)) {
    throw new Error("Некоректний файл резервної копії Hub.");
  }
  if (parsed.finyk && typeof parsed.finyk === "object") {
    const keys = Object.keys(parsed.finyk as object).filter(
      (k) => k !== "version",
    );
    if (keys.length > 0) {
      const withVer =
        "version" in (parsed.finyk as object)
          ? parsed.finyk
          : { ...(parsed.finyk as object), version: 1 };
      persistFinykNormalizedToStorage(normalizeFinykBackup(withVer));
    }
  }
  if (parsed.routine) {
    applyRoutineBackupPayload(parsed.routine);
  }
  if (parsed.fizruk) {
    applyFizrukFullBackupPayload(parsed.fizruk);
  }
  if (parsed.nutrition) {
    applyNutritionBackupPayload(parsed.nutrition);
  }
  if (parsed.hub && typeof parsed.hub === "object") {
    const h = parsed.hub;
    if (h.lastModule && VALID_MODULES.has(h.lastModule)) {
      safeWriteLS(HUB_MODULE_KEY, h.lastModule);
    }
    if (typeof h.chatHistory === "string") {
      safeWriteLS(HUB_CHAT_KEY, h.chatHistory);
    }
  }
}
