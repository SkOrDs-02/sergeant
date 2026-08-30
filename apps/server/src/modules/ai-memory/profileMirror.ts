/**
 * `user_profile.payload.memoryBank` → `ai_memories` (`source='profile'`)
 * дзеркалення. L-8 Фаза 2 (2026-08-09,
 * docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md).
 *
 * Контекст: Фаза 1 (міграція 118) розширила `ALLOWED_MEMORY_SOURCES` +
 * CHECK-constraint значенням `'profile'`, але лишила його "дозволеним, але
 * порожнім" — ingestion-hook приземляється тут. Мета: `ragContext.ts`
 * автоматично вкидає top-K схожих `ai_memories` записів у system prompt на
 * кожному першому чат-турі, але дивиться ЛИШЕ у `ai_memories`. Явно заявлені
 * факти з локального «банку памʼяті» (`hub_user_profile_v1`, дзеркальований
 * серверним `user_profile` з міграції 115 — `apps/web/src/core/profile/
 * profileWriteThrough.ts`) для нього невидимі, доки хтось не embed-ить їх
 * туди. Цей модуль — той хтось.
 *
 * Межі: pure diff-логіка тестується без DB/Voyage, DB/Voyage ходить
 * лише у `mirrorProfileMemoryEntries`. (Історична рідня — eventSync.ts,
 * PostHog-дзеркало; знято 2026-08-29.)
 *
 * ─── Idempotency (ПАСТКА 1 задачі) ─────────────────────────────────────
 *
 * Індекс `(user_id, source, source_ref)` з міграції 025 — звичайний
 * `CREATE INDEX`, НЕ unique (коментар у 068 це стверджував, спростовано у
 * фазі 1; сам коментар у 118 повторює це явно). `PARTITION BY HASH
 * (user_id)` не приймає UNIQUE поза partition-key, тому unique-семантику
 * тримає caller (`vectorStore.ts::upsert()` docstring). Веб пушить
 * ПОВНИЙ профіль після КОЖНОГО локального редагування банку
 * (`pushMemoryBankToServer` у `profileWriteThrough.ts`) — без діфу
 * повторний PUT того самого незмінного профілю насадив би дублі й
 * оплачував би по одному Voyage embed-у за кожен факт на КОЖЕН PUT.
 * Тому `mirrorProfileMemoryEntries` завжди спершу читає наявні
 * `source='profile'` рядки й вставляє/оновлює/видаляє лише різницю.
 *
 * ─── Soft-delete (ПАСТКА 5) ─────────────────────────────────────────────
 *
 * `forgetSource()` (`service.ts`) → `vectorStore.deleteBySource()` робить
 * HARD DELETE (`DELETE FROM ai_memories WHERE ...`), без огляду на
 * `deleted_at` — той самий вибір, що вже задокументований у
 * `listRoute.ts` для user-facing видалення ("рішення founder-а
 * 2026-07-25: Зникає назавжди"). Мʼяке видалення (`deleted_at`, міграція
 * 067) існує лише для founder-ового `/forget` у Telegram
 * (`forget.ts`) — інша авдиторія, інший власник, інша обіцянка.
 *
 * Тому запит "наявних рядків" нижче ОБОВʼЯЗКОВО фільтрує
 * `deleted_at IS NULL`: якщо founder колись `/forget`-нув чийсь
 * `profile`-рядок (technically можливо — `forgetById` не фільтрує по
 * `source`), без цього фільтра діф вважав би факт "наявним" і НЕ
 * переставив би його назад при незмінному тексті — тобто "видалене"
 * лишалось би невидимим для RAG назавжди, хоча людина в UI бачить
 * той самий факт й досі. З фільтром — soft-deleted рядок трактується як
 * "відсутній", і той самий source_ref просто вставляється наново
 * (self-healing).
 *
 * ─── Ніколи не валить PUT (ПАСТКА 4) ────────────────────────────────────
 *
 * Дзеркалення — побічний ефект. `remember()` може кинути (Voyage circuit
 * open, HTTP 5xx після вичерпаних retry, відсутній `VOYAGE_API_KEY` —
 * див. `embeddings.ts`), `forgetSource()` може впасти на мережевій
 * помилці Postgres. Уся діф+apply-послідовність тут обгорнута в один
 * try/catch (дзеркалить `recordProductMemoryEvent` у `eventSync.ts`) —
 * `mirrorProfileMemoryEntries` НІКОЛИ не кидає назовні, лише повертає
 * `{ ok: false, ... }` + warn-лог. `routes/me.ts` викликає цю функцію
 * ПІСЛЯ успішного `upsertUserProfile` — сам факт збереження профілю від
 * цієї функції не залежить.
 *
 * Консент (`AI_MEMORY_ENABLED` + per-user `ai_memory`-preference) тут НЕ
 * перевіряється окремо — `service.remember()` сам фільтрує неconsent-нутих
 * користувачів (`bootstrap.ts` передає `hasAiMemoryConsent`). Вимкнений
 * консент означає: diff однаково рахується, `remember()` тихо no-op-ить
 * для insert/update-частини, а `forgetSource()` (видалення) виконується
 * незалежно від консенту — право видалити власні дані consent-ом не
 * гейтиться.
 */

import { createHash } from "node:crypto";

import type { Pool } from "pg";

import { env } from "../../env.js";
import { logger, serializeError } from "../../obs/logger.js";
import { getAiMemory } from "./bootstrap.js";
import { enqueueMemoryIngest } from "./ingestQueue.js";
import type { RememberInput } from "./service.js";
import type { MemorySource } from "./types.js";

const PROFILE_SOURCE: MemorySource = "profile";

/**
 * Стеля на кількість фактів, які дзеркалюються за ОДИН виклик (ПАСТКА 3).
 * `UserProfilePayloadSchema` (16KB) технічно вміщує ~400 коротких фактів,
 * але кожен НОВИЙ/ЗМІНЕНИЙ факт — окремий Voyage embed-виклик. 200 —
 * розумна стеля: нормальний інтервʼю-профіль має ~10-30 фактів
 * (докстрінг 025), а стеля захищає від навмисно роздутого payload-а
 * (badly-behaved client / зловмисник із валідною сесією).
 */
export const PROFILE_MEMORY_MAX_ENTRIES = 200;

/**
 * Довжина `content`, що йде у Voyage embed + показується в RAG-блоці.
 * Той самий порядок величини, що `MAX_CONTENT_LEN` у `eventSync.ts`.
 */
export const PROFILE_MEMORY_CONTENT_MAX_LEN = 500;

const PROFILE_MEMORY_ID_MAX_LEN = 200;
const PROFILE_MEMORY_CATEGORY_MAX_LEN = 40;

export interface ProfileMemoryMirrorResult {
  /** `false` — щось у diff/apply впало; PUT все одно відповідає 200. */
  ok: boolean;
  inserted: number;
  updated: number;
  deleted: number;
  /** Вхідні записи, відкинуті валідацією (не object / без id-fact / порожні). */
  skippedInvalid: number;
  /** Вхідні записи, відкинуті через стелю `PROFILE_MEMORY_MAX_ENTRIES`. */
  skippedOverCap: number;
}

const ZERO_RESULT: ProfileMemoryMirrorResult = {
  ok: true,
  inserted: 0,
  updated: 0,
  deleted: 0,
  skippedInvalid: 0,
  skippedOverCap: 0,
};

interface NormalizedProfileMemoryEntry {
  id: string;
  fact: string;
  category: string;
  /** Лише для сортування при стелі — не потрапляє у `content`/`metadata`. */
  createdAt: string | null;
}

function truncate(value: string, maxLen: number): string {
  return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
}

function normalizeCategory(raw: unknown): string {
  if (typeof raw !== "string") return "other";
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "other";
  return truncate(trimmed, PROFILE_MEMORY_CATEGORY_MAX_LEN);
}

/**
 * Валідує один елемент `memoryBank.entries`. `payload` — відкритий
 * `z.record(z.string(), z.unknown())` (Hard Rule #3 контракт тут навмисно
 * широкий, схема — `UserProfilePayloadSchema` у `@sergeant/shared`), тому
 * елементи масиву можуть містити будь-що від будь-кого з валідною сесією.
 * `null` — елемент відкидається (не object, `id`/`fact` не рядок або
 * порожні після trim).
 */
function normalizeEntry(item: unknown): NormalizedProfileMemoryEntry | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const obj = item as Record<string, unknown>;
  const rawId = obj["id"];
  const rawFact = obj["fact"];
  if (typeof rawId !== "string" || typeof rawFact !== "string") return null;
  const id = rawId.trim();
  const fact = rawFact.trim();
  if (!id || !fact) return null;
  // Захист id-як-payload: `source_ref` іде у SQL і в metadata-лог, тож
  // необмежена довжина — вектор для роздування рядка / логів.
  if (id.length > PROFILE_MEMORY_ID_MAX_LEN) return null;
  const createdAt =
    typeof obj["createdAt"] === "string" ? obj["createdAt"] : null;
  return {
    id,
    fact: truncate(fact, PROFILE_MEMORY_CONTENT_MAX_LEN),
    category: normalizeCategory(obj["category"]),
    createdAt,
  };
}

/**
 * `memoryBank`-секція відсутня/спотворена → `null` ("нема інформації, не
 * чіпай наявні рядки"), а НЕ "порожній масив" ("людина стерла все").
 *
 * Різниця критична: `pushCombinedProfile` (веб) ЗАВЖДИ шле обидві
 * половини (`{...biometrics, memoryBank}`) разом, тож у нормальному
 * потоці ключ присутній завжди, навіть коли банк порожній (`entries: []`
 * — це РЕАЛЬНИЙ сигнал "фактів нуль"). Але payload — відкритий JSON без
 * колонкової схеми (міграція 115), і biometrics-only PUT з майбутнього/
 * легасі клієнта, який про `memoryBank` не знає, не повинен трактуватись
 * як "видали все" — інакше один PUT з чужого клієнта міг би мовчки
 * стерти чиюсь памʼять.
 */
function extractIncomingEntries(profile: unknown): unknown[] | null {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return null;
  }
  const memoryBank = (profile as Record<string, unknown>)["memoryBank"];
  if (
    !memoryBank ||
    typeof memoryBank !== "object" ||
    Array.isArray(memoryBank)
  ) {
    return null;
  }
  const entries = (memoryBank as Record<string, unknown>)["entries"];
  return Array.isArray(entries) ? entries : null;
}

interface NormalizeOutcome {
  entries: NormalizedProfileMemoryEntry[];
  skippedInvalid: number;
  skippedOverCap: number;
}

/**
 * Валідує + де-дублює (останній `id` виграє — клієнтський баг, не має
 * впасти) + рубає до `PROFILE_MEMORY_MAX_ENTRIES`. При стелі лишаємо
 * найновіші факти (за `createdAt`, парсні — спершу; непарсні — в кінець),
 * той самий пріоритет, що клієнтський `fitMemoryBankPayload` застосовує
 * при 16KB-стелі payload-а (`apps/web/.../profileWriteThrough.ts`).
 */
function normalizeIncomingEntries(rawEntries: unknown[]): NormalizeOutcome {
  const byId = new Map<string, NormalizedProfileMemoryEntry>();
  let skippedInvalid = 0;
  for (const item of rawEntries) {
    const normalized = normalizeEntry(item);
    if (!normalized) {
      skippedInvalid += 1;
      continue;
    }
    byId.set(normalized.id, normalized);
  }

  let list = [...byId.values()];
  let skippedOverCap = 0;
  if (list.length > PROFILE_MEMORY_MAX_ENTRIES) {
    list.sort((a, b) => {
      const at = a.createdAt ? Date.parse(a.createdAt) : NaN;
      const bt = b.createdAt ? Date.parse(b.createdAt) : NaN;
      const aValid = Number.isFinite(at);
      const bValid = Number.isFinite(bt);
      if (aValid && bValid) return bt - at;
      if (aValid) return -1;
      if (bValid) return 1;
      return 0;
    });
    skippedOverCap = list.length - PROFILE_MEMORY_MAX_ENTRIES;
    list = list.slice(0, PROFILE_MEMORY_MAX_ENTRIES);
  }

  return { entries: list, skippedInvalid, skippedOverCap };
}

/**
 * `content` = сирий `entry.fact` (ПАСТКА "формат content" з задачі).
 * Рішення: raw text без домішки категорії/дати. Обґрунтування:
 *   1. Semantic similarity — Voyage embed-ить `content` дослівно; чиста
 *      фраза факту ("алергія на горіхи") дає щільніший embedding, ближчий
 *      до природних query-запитів ("що в мене з алергіями?"), ніж
 *      префікс-шум типу "[health] алергія на горіхи" чи "2026-08-09:
 *      алергія на горіхи" (дата створення факту не incrementальна для
 *      пошуку, на відміну від `eventSync.ts`, де дата — частина
 *      *значення* події).
 *   2. `ragContext.ts::formatRagBlock` уже додає джерело й дату
 *      ЗОВНІШНЬО (`[Профіль • 2026-08-09] <content>` за
 *      SOURCE_LABEL_UK-мапою) — дублювати їх усередині `content` означає
 *      подвійний шум у system-prompt.
 *   3. Категорія — структурне поле для UI/фільтрів, не природна мова;
 *      кладемо її в `metadata.category`, а не в текст, що йде під
 *      cosine-similarity.
 */
/**
 * Короткий детермінований відбиток тексту факту — сіль для idempotent
 * jobId черги інжесту.
 *
 * Навіщо саме тут (знайдено security-ревʼю дифу, 2026-08-09). `sourceRef`
 * для `profile` — це локальний id факту, і він НЕ міняється, коли людина
 * редагує текст. А `buildJobId` у `ingestQueue.ts` складається саме з
 * `(userId, source, sourceRef)`. Тобто після переходу дзеркалення на чергу
 * оновлення факту виглядало так: старий рядок hard-видаляється
 * (`forgetSource`), новий job лягає в чергу з ТИМ САМИМ jobId — і BullMQ
 * мовчки його відкидає, поки попередній тримається в Redis
 * (`removeOnComplete: 24h`, `removeOnFail: 14d`). Факт зникав із RAG, а на
 * екрані лишався: у `user_profile` і localStorage він живий.
 *
 * Найгірше — без Redis (`runDirectDispatch`-фолбек) цього не відтворити,
 * тож ані локальні прогони, ані CI цього не бачили б. Це був би прод-only
 * баг із виглядом «асистент чомусь забув те, що я щойно виправив».
 *
 * 12 символів base64url (72 біти) — колізія тут коштувала б лише зайвої
 * дедуплікації двох різних текстів ОДНОГО факту одного юзера, тож повний
 * дайджест зайвий, а jobId лишається читабельним у BullMQ UI.
 */
function contentFingerprint(fact: string): string {
  return createHash("sha256")
    .update(fact, "utf8")
    .digest("base64url")
    .slice(0, 12);
}

/**
 * Скільки операцій дзеркалення тримаємо в польоті одночасно.
 *
 * `PROFILE_MEMORY_MAX_ENTRIES` — 200, і без стелі `Promise.all` по всьому
 * списку відкривав би до 200 паралельних `forgetSource` (DELETE по
 * партиційованій `ai_memories`) або 200 паралельних enqueue. Другий випадок
 * гірший, ніж виглядає: **без Redis** черга падає у `runDirectDispatch`, і
 * тоді 200 «дешевих push-ів у Redis» стають 200 одночасними Voyage-
 * ембеддингами на інтерактивному шляху `PUT /api/me/profile`. Пул зʼєднань
 * (`pg` дефолт — 10) вичерпується першим, решта стоїть у черзі, а роут
 * чекає на всіх.
 *
 * 10 — рівно розмір дефолтного пулу `pg`: більше не дає паралелізму, лише
 * довшу чергу очікування на зʼєднання.
 */
const MIRROR_CONCURRENCY = 10;

/**
 * `Promise.all` порціями по `MIRROR_CONCURRENCY`. Свідомо послідовний між
 * порціями: жодна порція не стартує, доки попередня не завершилась.
 *
 * Помилка будь-якої операції в порції відхиляє весь виклик — це навмисно:
 * викликач (`mirrorProfileMemoryEntries`) ловить її і повертає `ok:false`,
 * і краще зупинитись на першій порції, ніж дожати решту 190 операцій у
 * стан, який ми однаково відзвітуємо як невдалий.
 */
async function runChunked<T>(
  items: readonly T[],
  run: (item: T) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += MIRROR_CONCURRENCY) {
    const chunk = items.slice(i, i + MIRROR_CONCURRENCY);
    await Promise.all(chunk.map((item) => run(item)));
  }
}

function toRememberInput(
  userId: string,
  entry: NormalizedProfileMemoryEntry,
): RememberInput & { dedupeSalt: string } {
  return {
    userId,
    source: PROFILE_SOURCE,
    sourceRef: entry.id,
    content: entry.fact,
    metadata: { category: entry.category },
    dedupeSalt: contentFingerprint(entry.fact),
  };
}

interface ExistingProfileMemoryRow {
  source_ref: string | null;
  content: string;
}

/**
 * Дзеркалить `profile.memoryBank.entries` у `ai_memories`
 * (`source='profile'`). Викликається з `routes/me.ts` ПІСЛЯ успішного
 * `upsertUserProfile` — best-effort побічний ефект, ніколи не кидає
 * (ПАСТКА 4, докстрінг файлу вище).
 */
export async function mirrorProfileMemoryEntries(
  pool: Pool,
  userId: string,
  profile: unknown,
): Promise<ProfileMemoryMirrorResult> {
  if (!env.AI_MEMORY_ENABLED) {
    // Той самий early-exit, що `enqueueMemoryIngest` (mode="disabled") —
    // жодного SQL-запиту, коли фіча вимкнена глобально.
    return ZERO_RESULT;
  }

  const rawEntries = extractIncomingEntries(profile);
  if (rawEntries === null) {
    // "Нема інформації" — див. docstring `extractIncomingEntries`.
    return ZERO_RESULT;
  }

  const { entries, skippedInvalid, skippedOverCap } =
    normalizeIncomingEntries(rawEntries);

  try {
    const existing = await pool.query<ExistingProfileMemoryRow>(
      `SELECT source_ref, content
         FROM ai_memories
        WHERE user_id = $1
          AND source = $2
          AND source_ref IS NOT NULL
          AND deleted_at IS NULL`,
      [userId, PROFILE_SOURCE],
    );

    const existingBySourceRef = new Map<string, string>();
    for (const row of existing.rows) {
      if (row.source_ref !== null)
        existingBySourceRef.set(row.source_ref, row.content);
    }

    const incomingIds = new Set(entries.map((entry) => entry.id));
    const toForget: string[] = [];
    // Тип — саме `ReturnType<typeof toRememberInput>`, не `RememberInput[]`.
    // `toRememberInput` повертає `RememberInput & { dedupeSalt: string }`, і
    // під ширшим типом сіль виживала б лише тому, що обʼєкт проходить
    // наскрізь незміненим. Рефактор, який перезбирає елемент за оголошеним
    // типом, тихо загубив би `dedupeSalt` — і повернув би баг дедупу BullMQ,
    // описаний вище, БЕЗ помилки типів.
    const toWrite: Array<ReturnType<typeof toRememberInput>> = [];
    let inserted = 0;
    let updated = 0;

    for (const entry of entries) {
      const existingContent = existingBySourceRef.get(entry.id);
      if (existingContent === undefined) {
        toWrite.push(toRememberInput(userId, entry));
        inserted += 1;
      } else if (existingContent !== entry.fact) {
        // Текст факту змінився — видалити стару embedding-версію й
        // записати наново, інакше RAG підтягує застарілий текст (задача,
        // ПАСТКА "оновлення").
        toForget.push(entry.id);
        toWrite.push(toRememberInput(userId, entry));
        updated += 1;
      }
      // else: незмінний факт — no-op (це і є idempotency, ПАСТКА 1).
    }

    let deleted = 0;
    for (const sourceRef of existingBySourceRef.keys()) {
      if (!incomingIds.has(sourceRef)) {
        // Людина забула факт локально — "забув" мусить доїхати до RAG.
        toForget.push(sourceRef);
        deleted += 1;
      }
    }

    const service = getAiMemory();
    if (toForget.length > 0) {
      await runChunked(toForget, (sourceRef) =>
        service.forgetSource(userId, PROFILE_SOURCE, sourceRef),
      );
    }
    if (toWrite.length > 0) {
      // Запис іде В ЧЕРГУ, а не прямим `service.remember()`.
      //
      // Чому це важливо саме тут: `remember()` ембедить СИНХРОННО (виклик
      // у Voyage), а `routes/me.ts` чекає на дзеркалення перед відповіддю.
      // Прямий виклик означав би, що КОЖНЕ збереження профілю — і банку
      // памʼяті, і біометрії, бо payload у них спільний — тримає HTTP-
      // відповідь на час embed-у кожного нового чи зміненого факту.
      // Інтерактивний шлях платив би за фонову роботу.
      //
      // `enqueueMemoryIngest` — той самий шлях, яким ходять server-side
      // хуки (finyk-webhook, digest), і він дешевий: push у Redis. Без Redis (local dev / CI / інцидент)
      // черга сама падає у `runDirectDispatch`, тобто поведінка дорівнює
      // прямому виклику — факти не губляться, лише зникає асинхронність.
      //
      // Бонус, який тут доречніший, ніж будь-де: `sourceRef` (наш
      // локальний id факту) стає idempotent jobId у BullMQ. Індекс
      // `(user_id, source, source_ref)` у 025 НЕ unique, тож дедуп у нас
      // тримається на діфі вище — jobId додає другий шар рівно на той
      // випадок, коли два пуші профілю прилетять паралельно.
      await runChunked(toWrite, (input) => enqueueMemoryIngest(input));
    }

    return {
      ok: true,
      inserted,
      updated,
      deleted,
      skippedInvalid,
      skippedOverCap,
    };
  } catch (err) {
    logger.warn({
      msg: "ai_memory_profile_mirror_failed",
      userId,
      err: serializeError(err, { includeStack: false }),
    });
    return {
      ok: false,
      inserted: 0,
      updated: 0,
      deleted: 0,
      skippedInvalid,
      skippedOverCap,
    };
  }
}
