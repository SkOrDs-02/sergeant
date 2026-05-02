import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage";
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
  hub?: { lastModule?: string; chatHistory?: string };
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
  if (m) hub.lastModule = m;
  if (includeChat) {
    const chat = safeReadStringLS(HUB_CHAT_KEY);
    if (chat) hub.chatHistory = chat;
  }
  return {
    kind: HUB_BACKUP_KIND,
    schemaVersion: HUB_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    finyk,
    fizruk: buildFizrukFullBackupPayload(),
    routine: buildRoutineBackupPayload(),
    nutrition: buildNutritionBackupPayload(),
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
    (parsed as Record<string, unknown>).kind === HUB_BACKUP_KIND &&
    typeof (parsed as Record<string, unknown>).schemaVersion === "number"
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
