/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { normalizeNutritionPrefs } from "@sergeant/nutrition-domain";
import type { Pantry, PantryItemSource } from "@sergeant/nutrition-domain";
import {
  addMissingBy,
  type BackupRestoreMode,
} from "@shared/lib/backup/restoreMode";
import {
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_PREFS_KEY,
  NUTRITION_LOG_KEY,
  defaultNutritionPrefs,
  loadActivePantryId,
  loadNutritionLog,
  loadNutritionPrefs,
  loadPantries,
  normalizeNutritionLog,
  persistNutritionLog,
  persistNutritionPrefs,
  persistPantries,
  type NutritionLog,
  type NutritionPrefs,
} from "../lib/nutritionStorage";
import {
  applyNutritionBackupSections,
  parseNutritionBackupSections,
  readNutritionBackupSections,
  type NutritionBackupSections,
} from "./nutritionBackupSections";

export const NUTRITION_BACKUP_KIND = "hub-nutrition-backup";
/**
 * v2 (аудит 2026-10-01, data-35): позиції комори несуть `sources` і зʼявились
 * необовʼязкові секції `recipes`, `shoppingList`, `waterLog`, `goalPeriods`.
 * Файли v1 імпортуються як і раніше: відсутня секція відповідних даних не чіпає.
 */
export const NUTRITION_BACKUP_SCHEMA_VERSION = 2;

export interface NutritionBackupPantryItem {
  name: string;
  qty: number | null;
  unit: string | null;
  notes: string | null;
  /** Варіанти покупок позиції; відсутнє = «не знаю» (не стирає наявні). */
  sources?: PantryItemSource[];
}

export interface NutritionBackupPantry {
  id: string;
  name: string;
  text: string;
  items: NutritionBackupPantryItem[];
}

export interface NutritionBackupData extends NutritionBackupSections {
  stateSchemaVersion: 1;
  pantries: NutritionBackupPantry[];
  activePantryId: string;
  prefs: NutritionPrefs;
  log: NutritionLog | Record<string, unknown>;
}

export interface NutritionBackupPayload {
  kind: typeof NUTRITION_BACKUP_KIND;
  schemaVersion: number;
  exportedAt: string;
  data: NutritionBackupData;
}

function safeString(x: unknown, fallback = ""): string {
  return x == null ? fallback : String(x);
}

function safeNumber(x: unknown, fallback: number | null = null): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function optionalPositiveNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Мінімальна валідація варіантів покупок. Якщо хоч один запис зіпсований,
 * масив відкидається ЦІЛКОМ (`undefined`): частина варіантів порушила б
 * інваріант «сума варіантів = кількість позиції», а `undefined` (на відміну від
 * `null`) не затирає наявні варіанти при відновленні.
 */
function normalizePantryItemSources(
  raw: unknown,
): PantryItemSource[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: PantryItemSource[] = [];
  for (const s of raw as unknown[]) {
    if (!s || typeof s !== "object") return undefined;
    const r = s as Record<string, unknown>;
    const name = typeof r["name"] === "string" ? r["name"].trim() : "";
    const unit = typeof r["unit"] === "string" ? r["unit"].trim() : "";
    const qty = r["qty"];
    if (!name || !unit) return undefined;
    if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
      return undefined;
    }
    const addedAt = r["addedAt"];
    if (addedAt != null && typeof addedAt !== "string") return undefined;
    const item: PantryItemSource = {
      name,
      qty,
      unit,
      addedAt: addedAt ?? null,
    };
    // `packCount` / `packGrams` їдуть як є: це підказки відображення, не
    // частина інваріанта кількості.
    for (const key of ["packCount", "packGrams"] as const) {
      const v = r[key];
      if (v === undefined) continue;
      if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) {
        return undefined;
      }
      item[key] = v;
    }
    out.push(item);
  }
  return out;
}

function normalizePantryItem(x: unknown): NutritionBackupPantryItem | null {
  if (!x || typeof x !== "object") return null;
  const rec = x as Record<string, unknown>;
  const name = safeString(rec["name"], "").trim();
  if (!name) return null;
  const qty =
    rec["qty"] == null || rec["qty"] === ""
      ? null
      : safeNumber(rec["qty"], null);
  const unit =
    rec["unit"] == null || rec["unit"] === ""
      ? null
      : safeString(rec["unit"], "").trim();
  const notes =
    rec["notes"] == null || rec["notes"] === ""
      ? null
      : safeString(rec["notes"], "").trim();
  const sources = normalizePantryItemSources(rec["sources"]);
  return { name, qty, unit, notes, ...(sources ? { sources } : {}) };
}

function normalizePantry(x: unknown): NutritionBackupPantry | null {
  if (!x || typeof x !== "object") return null;
  const rec = x as Record<string, unknown>;
  const id = safeString(rec["id"], "").trim();
  const name = safeString(rec["name"], "").trim() || "Комора";
  const text = safeString(rec["text"], "");
  const items = Array.isArray(rec["items"])
    ? rec["items"]
        .map(normalizePantryItem)
        .filter((v): v is NutritionBackupPantryItem => v != null)
    : [];
  return { id: id || `p_${Date.now()}`, name, text, items };
}

function normalizePrefs(x: unknown): NutritionPrefs {
  if (!x || typeof x !== "object" || Array.isArray(x))
    return defaultNutritionPrefs();
  const p = { ...defaultNutritionPrefs(), ...(x as Partial<NutritionPrefs>) };
  return {
    goal: p.goal ? String(p.goal) : "balanced",
    servings: safeNumber(p.servings, 1) || 1,
    timeMinutes: safeNumber(p.timeMinutes, 25) || 25,
    exclude: p.exclude == null ? "" : String(p.exclude),
    recipeMealType: p.recipeMealType,
    recipePantryMode: p.recipePantryMode,
    dailyTargetKcal: optionalPositiveNumber(p.dailyTargetKcal),
    dailyTargetProtein_g: optionalPositiveNumber(p.dailyTargetProtein_g),
    dailyTargetFat_g: optionalPositiveNumber(p.dailyTargetFat_g),
    dailyTargetCarbs_g: optionalPositiveNumber(p.dailyTargetCarbs_g),
    adaptiveGoalEnabled: Boolean(p.adaptiveGoalEnabled),
    adaptiveGoalIntent: p.adaptiveGoalIntent,
    adaptiveGoalLastUpdatedAt:
      typeof p.adaptiveGoalLastUpdatedAt === "string"
        ? p.adaptiveGoalLastUpdatedAt
        : null,
    // Знімок підстави проходить бекап через доменну нормалізацію, а не
    // копіюється як є: половина знімка дала б картці «витрата ≈NaN».
    adaptiveGoalLastReason: normalizeNutritionPrefs({
      adaptiveGoalLastReason: p.adaptiveGoalLastReason,
    }).adaptiveGoalLastReason,
    mealTemplates: Array.isArray(p.mealTemplates)
      ? p.mealTemplates.slice(0, 40)
      : [],
    reminderEnabled: Boolean(p.reminderEnabled),
    reminderHour:
      p.reminderHour != null && Number.isFinite(Number(p.reminderHour))
        ? Math.min(23, Math.max(0, Math.floor(Number(p.reminderHour))))
        : 12,
    waterGoalMl:
      p.waterGoalMl != null && Number.isFinite(Number(p.waterGoalMl))
        ? Math.max(0, Math.floor(Number(p.waterGoalMl)))
        : 2000,
  };
}

export function buildNutritionBackupPayload(): NutritionBackupPayload {
  // Stage 8 PR #057n-tombstone: all four reads now hit the SQLite
  // warm cache (populated at boot by `useNutritionSqliteReadBoot`),
  // not LS. Backup is an on-demand user action so the cache is
  // guaranteed to be warm by the time this runs.
  const pantries = loadPantries(
    NUTRITION_PANTRIES_KEY,
    NUTRITION_ACTIVE_PANTRY_KEY,
  );
  const activePantryId = safeString(
    loadActivePantryId(NUTRITION_ACTIVE_PANTRY_KEY),
    "home",
  );
  const prefs = loadNutritionPrefs(NUTRITION_PREFS_KEY);
  const log = loadNutritionLog(NUTRITION_LOG_KEY);

  return {
    kind: NUTRITION_BACKUP_KIND,
    schemaVersion: NUTRITION_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      stateSchemaVersion: 1,
      pantries: Array.isArray(pantries)
        ? pantries
            .map(normalizePantry)
            .filter((v): v is NutritionBackupPantry => v != null)
        : [],
      activePantryId: activePantryId || "home",
      prefs: normalizePrefs(prefs),
      log: log && typeof log === "object" && !Array.isArray(log) ? log : {},
      ...readNutritionBackupSections(),
    },
  };
}

/**
 * Чиста фаза «validate all» імпорту (аудит 2026-10-01, data-34): нічого не
 * пише, кидає на файлі не того типу чи форми й повертає нормалізовані секції.
 */
function parseNutritionBackupPayload(payload: unknown): {
  data: Record<string, unknown>;
  pantries: NutritionBackupPantry[];
  activePantryId: string;
  prefs: NutritionPrefs;
  sections: NutritionBackupSections;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Некоректний бекап харчування.");
  }
  const p = payload as Record<string, unknown>;
  if (p["kind"] !== NUTRITION_BACKUP_KIND) {
    throw new Error("Некоректний тип бекапу харчування.");
  }
  if (typeof p["schemaVersion"] !== "number") {
    throw new Error("Некоректна версія схеми бекапу харчування.");
  }
  const data = p["data"] as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Некоректні дані бекапу харчування.");
  }

  const pantries = Array.isArray(data["pantries"])
    ? data["pantries"]
        .map(normalizePantry)
        .filter((v): v is NutritionBackupPantry => v != null)
    : [];
  const activePantryId = safeString(data["activePantryId"], "home") || "home";
  const prefs = normalizePrefs(data["prefs"]);
  const log = data["log"];
  if (log && typeof log === "object" && !Array.isArray(log)) {
    normalizeNutritionLog(log);
  }
  return {
    data,
    pantries,
    activePantryId,
    prefs,
    sections: parseNutritionBackupSections(data),
  };
}

/** Фаза «validate all» Hub-імпорту: кидає на битому файлі, нічого не пишучи. */
export function validateNutritionBackupPayload(payload: unknown): void {
  parseNutritionBackupPayload(payload);
}

/**
 * `mode` — див. `BackupRestoreMode`. Дефолт `replace` лишає поведінку
 * наявних викликів (хмарний бекап); Hub-імпорт передає режим явно, і його
 * дефолт — `merge`: додати відсутнє, нічого не видаляючи на пристрої й
 * на сервері (аудит 2026-10-01, data-06).
 *
 * Валідація і записи комори/prefs/журналу синхронні (кидає на битому файлі до
 * першого запису); повернений проміс - хвіст секцій data-35 (IDB-дзеркало
 * рецептів, відмова запису) і його ОБОВʼЯЗКОВО чекати перед перезавантаженням.
 */
export function applyNutritionBackupPayload(
  payload: unknown,
  mode: BackupRestoreMode = "replace",
): Promise<void> {
  const { data, pantries, activePantryId, prefs, sections } =
    parseNutritionBackupPayload(payload);

  if (mode === "merge") {
    mergeNutritionBackup({ pantries, log: data["log"] });
    return applyNutritionBackupSections(sections, mode);
  }

  // Stage 8 PR #057n-tombstone: writes go through the dual-write
  // pipeline so the SQLite tables become the source of truth and the
  // warm cache reflects the restored payload on next overlay tick.
  // The previous `safeWriteLS` swallow-quota semantics is preserved
  // because `persist*` returns a boolean — the caller already calls
  // `window.location.reload()` so any partial failure is recovered
  // from on the next boot via `importNutritionResidualFromLs` (no-op
  // here since LS is no longer touched, but the dual-write happy path
  // will have populated SQLite).
  persistPantries(
    NUTRITION_PANTRIES_KEY,
    NUTRITION_ACTIVE_PANTRY_KEY,
    pantries,
    activePantryId,
  );
  // Відновлення з бекапу — явна заміна цілого стану: користувач свідомо
  // хоче, щоб бекап переміг, тож гейт гідратації (data-04) тут не діє.
  persistNutritionPrefs(prefs, NUTRITION_PREFS_KEY, undefined, {
    allowUnhydrated: true,
  });
  if (
    data["log"] &&
    typeof data["log"] === "object" &&
    !Array.isArray(data["log"])
  ) {
    persistNutritionLog(normalizeNutritionLog(data["log"]), NUTRITION_LOG_KEY);
  }
  return applyNutritionBackupSections(sections, mode);
}

/**
 * Режим `merge`: комори за id (наявна комора лишається такою, яка є, а
 * порожню, наприклад свіжу `home`, файл заповнює; `text` і `items` комори
 * ніколи не змішуються, щоб не розійтись), журнал їжі по днях (лише прийоми
 * з новим id). Налаштування й активна комора лишаються поточними. Жодного
 * видалення, тож жодного tombstone на сервері.
 */
function mergeNutritionBackup(file: {
  pantries: NutritionBackupPantry[];
  log: unknown;
}): void {
  const currentPantries = loadPantries(
    NUTRITION_PANTRIES_KEY,
    NUTRITION_ACTIVE_PANTRY_KEY,
  );
  const known = new Map(currentPantries.map((p) => [p.id, p]));
  const merged = currentPantries.map((p) => {
    const incoming = file.pantries.find((f) => f.id === p.id);
    const isEmpty = p.items.length === 0 && p.text.trim() === "";
    return incoming && isEmpty ? (incoming as Pantry) : p;
  });
  const added = file.pantries.filter((f) => !known.has(f.id));
  persistPantries(
    NUTRITION_PANTRIES_KEY,
    NUTRITION_ACTIVE_PANTRY_KEY,
    [...merged, ...(added as Pantry[])],
    loadActivePantryId(NUTRITION_ACTIVE_PANTRY_KEY),
  );

  const incomingLog =
    file.log && typeof file.log === "object" && !Array.isArray(file.log)
      ? normalizeNutritionLog(file.log)
      : null;
  if (!incomingLog) return;
  const currentLog = loadNutritionLog(NUTRITION_LOG_KEY);
  const nextLog: NutritionLog = { ...currentLog };
  for (const [day, entry] of Object.entries(incomingLog)) {
    const existing = nextLog[day]?.meals ?? [];
    const meals = addMissingBy(existing, entry?.meals ?? [], (m) => m.id);
    if (meals.length !== existing.length) nextLog[day] = { meals };
  }
  persistNutritionLog(nextLog, NUTRITION_LOG_KEY);
}
