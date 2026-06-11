import pg from "pg";

/**
 * Hard Rule #1 (bigint → number) на рівні драйвера.
 *
 * Postgres `int8` (BIGINT-колонки, `COUNT(*)`, `SUM(...)`) node-pg за
 * замовчуванням віддає рядком — без глобального парсера кожен серіалізатор
 * мусить пам'ятати про ручну коерсію (`Number(...)` / `toNumberOrNull`).
 * Серіалізатори лишаються другим рубежем; парсер закриває клас помилок
 * «забув скоерсити» біля джерела.
 *
 * Гроші в копійках вміщуються в JS number з величезним запасом
 * (MAX_SAFE_INTEGER ≈ 90 трлн грн), але мовчазна втрата точності на
 * значеннях за межею зіпсувала б суми непомітно — тому fail loud.
 */
const INT8_OID = 20;

export function parseInt8(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new Error(
      `int8 value "${value}" не вміщується в Number.MAX_SAFE_INTEGER — відмова від lossy-коерсії`,
    );
  }
  return n;
}

/**
 * Реєструє парсер глобально для всього `pg`-модуля процесу: достатньо
 * одного виклику в `db.ts` — replica pool і будь-які інші `new pg.Pool()`
 * у тому ж процесі отримують його автоматично.
 */
export function installInt8Parser(): void {
  pg.types.setTypeParser(INT8_OID, parseInt8);
}
