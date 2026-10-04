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
// eslint-disable-next-line sergeant-design/no-flat-shared-lib -- log/ is a real subdir; consumed by storage/ for warn-level error reporting.
import { logger } from "../log";
import { getActiveSqliteKvStore } from "../../../core/db/kvStoreBoot";
import { getStorageReadySnapshot } from "../../../core/db/storageReady";
import { webKVStore } from "./storage";

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
  /** Кастомний логер (для тестів). Default — `logger.warn` з префіксом. */
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
  // typedStore reads/writes are routed through `webKVStore`, which falls
  // back to a memory store on SSR / restricted environments. We still
  // gate the storage path so callers in node-without-jsdom keep getting
  // the in-memory `defaultValue` semantics they relied on.
  const g = globalThis as { localStorage?: unknown };
  return typeof g.localStorage !== "undefined" && g.localStorage !== null;
}

/**
 * `true`, поки постійне сховище ще не визначилось: бут `bootstrapKvStore()`
 * іде (`main.tsx` армує latch синхронно до першого рендера), а SQLite
 * kv-стор ще не активний. У цьому вікні `webKVStore` віддає сирий
 * localStorage, де SQLite-ключів (`hub_flags_v1`, …) просто немає, тож
 * перше читання НЕ можна фіксувати назавжди (priv-03): інакше `{}` з
 * порожнього LS пережив би бут, а PIN-блокування мовчки вимикалось би.
 * Latch `storageReady` за замовчуванням `true` — тести/SSR/Storybook цього
 * вікна не мають.
 */
function isStorageBooting(): boolean {
  return getActiveSqliteKvStore() === null && !getStorageReadySnapshot();
}

/** Внутрішній хендл стора для {@link reloadAllTypedStores}. */
interface RegisteredStore {
  /** Знімає стару `onChange`-підписку і вішає нову на активне сховище. */
  rebind(): void;
  reload(): unknown;
}

/**
 * Реєстр усіх створених typed-стор-ів. Живуть увесь час життя сторінки
 * (модульні сінглтони), тож запис не прибирається.
 */
const registry = new Set<RegisteredStore>();

/**
 * Перечитує КОЖЕН typed-стор з активного сховища і переприв'язує його
 * `onChange` до нього (з notify підписникам). Кличеться:
 *  - з `main.tsx` після `bootstrapKvStore()` і до `markStorageReady()`:
 *    стори, створені й прочитані до буту, бачили сирий localStorage, а
 *    `webKVStore.onChange` прив'язався до LS-стора, і значення з SQLite
 *    (`hub_flags_v1`) до них ніколи не доходило;
 *  - з logout-чистки після `resetKvStoreBoot()`: активне сховище знову
 *    LS, а кеш тримав би значення попереднього користувача.
 * Під час перемикання SQLite-розділу на акаунт `replaceCache()` сам сповіщає
 * вже прив'язані підписки, тож окремого виклику там не треба.
 */
export function reloadAllTypedStores(): void {
  for (const entry of Array.from(registry)) {
    try {
      entry.rebind();
      entry.reload();
    } catch (err) {
      try {
        logger.warn("[typedStore] reloadAll failed", err);
      } catch {
        /* ignore logging errors */
      }
    }
  }
}

function defaultReport(key: string, scope: string, error: unknown): void {
  try {
    // Консистентно з createModuleStorage: один префікс, warn-рівень.
    logger.warn(`[typedStore:${key}] ${scope}`, error);
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
  // Тимчасовий кеш читання ДО буту: ключ — сирий рядок зі сховища. Дає
  // ref-стабільний результат для `useSyncExternalStore`, але не фіксується
  // (`cachedLoaded` лишається false), поки сховище не визначилось.
  let provisionalRaw: string | null | undefined;
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

  function currentRaw(): string | null {
    return hasLocalStorage() ? webKVStore.getString(key) : null;
  }

  function parseRaw(raw: string | null): T {
    if (raw === null) return defaultValue;

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

  /** Читає з активного сховища; фіксує кеш лише коли сховище визначилось. */
  function load(): T {
    const raw = currentRaw();
    if (isStorageBooting()) {
      if (provisionalRaw === undefined || provisionalRaw !== raw) {
        cached = parseRaw(raw);
        provisionalRaw = raw;
      }
      cachedLoaded = false;
      return cached as T;
    }
    cached = parseRaw(raw);
    cachedLoaded = true;
    provisionalRaw = undefined;
    return cached;
  }

  function get(): T {
    if (!cachedLoaded) return load();
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
    provisionalRaw = undefined;
    if (!hasLocalStorage()) {
      notify(result.data);
      return true;
    }
    const envelope: Envelope<T> = { __v: version, data: result.data };
    let serialized: string;
    try {
      serialized = JSON.stringify(envelope);
    } catch (err) {
      report("write", err);
      return false;
    }
    try {
      webKVStore.setString(key, serialized);
    } catch (err) {
      report("write", err);
      return false;
    }
    notify(result.data);
    return true;
  }

  function reset(): void {
    cached = defaultValue;
    cachedLoaded = true;
    provisionalRaw = undefined;
    if (hasLocalStorage()) webKVStore.remove(key);
    notify(defaultValue);
  }

  function subscribe(listener: Listener<T>): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function reload(): T {
    // Явний reload скидає і тимчасовий кеш: свіже читання завжди з активного
    // сховища (див. `load()` щодо вікна буту).
    provisionalRaw = undefined;
    const next = load();
    notify(next);
    return next;
  }

  // Якщо інший tab змінив цей ключ — підхопимо і повідомимо підписників.
  // `webKVStore.onChange` фільтрує по ключу та використовує DOM `storage`
  // event під капотом (cross-tab); same-tab writes notify через `notify()`.
  // Підписка резолвиться на сховище, активне ЗАРАЗ (до буту — LS, після —
  // SQLite kv з BroadcastChannel), тож `rebind()` вішає її заново, коли
  // активне сховище змінилось (`reloadAllTypedStores`).
  const bindChange = (): (() => void) =>
    webKVStore.onChange(key, () => {
      reload();
    });
  let unbindChange = bindChange();
  registry.add({
    rebind() {
      unbindChange();
      unbindChange = bindChange();
    },
    reload,
  });

  return { key, get, set, reset, subscribe, reload };
}
