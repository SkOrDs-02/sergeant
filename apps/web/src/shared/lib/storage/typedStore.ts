// Типізоване, версійоване сховище поверх localStorage.
//
// Закриває повторювані болі проєкту:
//  - «бита» JSON у сховищі валить читач → тут це log + fallback;
//  - несумісні формати між релізами → офіційний канал міграцій;
//  - «де зберігається ця фіча?» → реєстр з id/версією/схемою;
//  - консьюмери хочуть React-реактивність → вбудована підписка + хук.
//
// Надихнувся API persist-міддлварі pmndrs/zustand і шарами сховища
// actualbudget. Zod обраний як схема-рантайм: у codebase вже є TS, валідація
// на читанні захищає від чужих даних у LS (export/import, ручні правки
// у DevTools, регресії формату).
//
// Використання:
//   const store = createTypedStore({
//     key: "finyk_budgets",
//     version: 1,
//     schema: z.array(BudgetSchema),
//     defaultValue: [],
//     migrations: { 0: (old) => migrateV0ToV1(old) },
//   });
//   const budgets = store.get();
//   store.set(budgets);
//   const unsubscribe = store.subscribe((next) => { ... });

import type { ZodType } from "zod";
import { safeJsonSet } from "./storageQuota";

type Listener<T> = (value: T) => void;

/** Запакована форма, яку ми зберігаємо у localStorage. */
interface Envelope<T> {
  __v: number;
  data: T;
}

export interface TypedStoreOptions<T> {
  /** localStorage-ключ (ми його не префіксуємо — сумісно з legacy-ключами). */
  key: string;
  /** Поточна версія формату. Інкрементуйте при breaking-зміні схеми. */
  version: number;
  /** Zod-схема для data (без envelope). */
  schema: ZodType<T>;
  /** Значення, якщо ключа ще немає або парсинг/валідація впали. */
  defaultValue: T;
  /**
   * Мапа міграцій: `fromVersion → (data) => nextData`.
   * Запускаються послідовно від версії у envelope до поточної.
   * Приймають будь-що (невідомий формат) і повертають форму наступної версії.
   */
  migrations?: Record<number, (input: unknown) => unknown>;
  /** Кастомний логер (для тестів). Default — console.warn з префіксом. */
  reportError?: (scope: string, error: unknown) => void;
  /** Legacy-адаптер: якщо envelope відсутній, приймаємо сиру форму як v = `legacyVersion` і мігруємо. */
  legacyVersion?: number;
}

export interface TypedStore<T> {
  key: string;
  get(): T;
  set(value: T): boolean;
  reset(): void;
  subscribe(listener: Listener<T>): () => void;
  /** Повторне читання з LS (наприклад, після зовнішнього import). */
  reload(): T;
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined" && localStorage !== null;
}

function defaultReport(key: string, scope: string, error: unknown): void {
  try {
    // Консистентно з createModuleStorage: один префікс, warn-рівень.
    console.warn(`[typedStore:${key}] ${scope}`, error);
  } catch {
    /* ignore logging errors */
  }
}

/**
 * Піднімає legacy / старовинні дані до поточної версії через ланцюжок
 * міграцій. Кожна міграція отримує сирі дані попередньої версії.
 */
function runMigrations(
  raw: unknown,
  fromVersion: number,
  toVersion: number,
  migrations: Record<number, (input: unknown) => unknown>,
): unknown {
  let data = raw;
  for (let v = fromVersion; v < toVersion; v += 1) {
    const step = migrations[v];
    if (typeof step !== "function") {
      // Немає міграції — вважаємо, що форма не змінилась, просто підвищуємо
      // версію. Це свідома «гнучка» поведінка: не всяка зміна схеми вимагає
      // трансформації даних (наприклад, додали новий опціональний ключ).
      continue;
    }
    data = step(data);
  }
  return data;
}

export function createTypedStore<T>(
  options: TypedStoreOptions<T>,
): TypedStore<T> {
  const {
    key,
    version,
    schema,
    defaultValue,
    migrations = {},
    reportError,
    legacyVersion = 0,
  } = options;

  const report = (scope: string, error: unknown) =>
    (reportError ?? ((s, e) => defaultReport(key, s, e)))(scope, error);

  let cached: T | null = null;
  let cachedLoaded = false;
  const listeners = new Set<Listener<T>>();

  function notify(next: T): void {
    for (const l of listeners) {
      try {
        l(next);
      } catch (err) {
        report("listener", err);
      }
    }
  }

  function readFromStorage(): T {
    if (!hasLocalStorage()) return defaultValue;
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      report("read", error);
      return defaultValue;
    }
    if (raw === null || raw === undefined) return defaultValue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      report("JSON.parse", error);
      return defaultValue;
    }

    // Розпізнаємо envelope vs legacy (сира форма без обгортки).
    let payload: unknown;
    let fromVersion: number;
    if (
      parsed &&
      typeof parsed === "object" &&
      "__v" in (parsed as object) &&
      "data" in (parsed as object)
    ) {
      const env = parsed as Envelope<unknown>;
      payload = env.data;
      fromVersion =
        typeof env.__v === "number" && Number.isFinite(env.__v) ? env.__v : 0;
    } else {
      payload = parsed;
      fromVersion = legacyVersion;
    }

    if (fromVersion < version) {
      try {
        payload = runMigrations(payload, fromVersion, version, migrations);
      } catch (error) {
        report(`migrate(${fromVersion}→${version})`, error);
        return defaultValue;
      }
    } else if (fromVersion > version) {
      // Форма з майбутнього (rollback після апгрейду, наприклад). Краще
      // показати default, ніж зламано прочитати.
      report("version", `stored __v=${fromVersion} > current ${version}`);
      return defaultValue;
    }

    const result = schema.safeParse(payload);
    if (!result.success) {
      report("schema", result.error);
      return defaultValue;
    }
    return result.data;
  }

  function get(): T {
    if (!cachedLoaded) {
      cached = readFromStorage();
      cachedLoaded = true;
    }
    return cached as T;
  }

  function set(value: T): boolean {
    const result = schema.safeParse(value);
    if (!result.success) {
      report("schema(set)", result.error);
      return false;
    }
    cached = result.data;
    cachedLoaded = true;
    if (!hasLocalStorage()) {
      notify(result.data);
      return true;
    }
    const envelope: Envelope<T> = { __v: version, data: result.data };
    const res = safeJsonSet(key, envelope);
    if (!res || !res.ok) {
      report("write", res?.reason || res?.error || "unknown");
      return false;
    }
    notify(result.data);
    return true;
  }

  function reset(): void {
    cached = defaultValue;
    cachedLoaded = true;
    if (hasLocalStorage()) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        report("remove", error);
      }
    }
    notify(defaultValue);
  }

  function subscribe(listener: Listener<T>): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function reload(): T {
    cached = readFromStorage();
    cachedLoaded = true;
    notify(cached);
    return cached;
  }

  // Якщо інший tab змінив цей ключ — підхопимо і повідомимо підписників.
  if (typeof window !== "undefined") {
    try {
      window.addEventListener("storage", (ev) => {
        if (ev.storageArea !== localStorage) return;
        if (ev.key !== key) return;
        reload();
      });
    } catch {
      /* SSR / restricted env */
    }
  }

  return { key, get, set, reset, subscribe, reload };
}
