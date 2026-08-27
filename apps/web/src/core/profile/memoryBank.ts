import { z } from "zod";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  safeReadLS,
  safeReadLSValidated,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import type { MemoryEntry } from "./types";
import type { IconName } from "@shared/components/ui/Icon";

export const PROFILE_KEY = STORAGE_KEYS.USER_PROFILE;

/**
 * L-8 (2026-08-08, profile-settings-deep-audit): «коли банк памʼяті
 * востаннє писали на ЦЬОМУ пристрої» — потрібен `profileWriteThrough.ts`
 * для LWW-звірки з `/api/me/profile` (migration 115). ОКРЕМИЙ ключ, а не
 * поле всередині `PROFILE_KEY`: той зберігає РІВНО `MemoryEntry[]`
 * (сумісність із `readMemoryEntries()`/`writeMemoryEntries()` — і
 * `MemoryBankSection.tsx`, і чат-тули `remember`/`forget`/`myProfile`
 * очікують масив, не конверт), тож мітка часу не може жити в тому самому
 * blob-і без зламу формату для КОЖНОГО існуючого користувача.
 *
 * НЕ в `packages/shared/src/lib/storageKeys.ts` (`STORAGE_KEYS`) навмисно
 * — задача L-8 explicitly не чіпає `packages/**`, а логаут-очистка
 * (`purgeAppOwnedLocalData` → `APP_OWNED_LS_PREFIXES`) і так підхоплює
 * цей ключ через префікс `hub_`, тож окремої реєстрації для privacy-
 * гарантій не потрібно.
 */
const MEMORY_BANK_META_KEY = "hub_user_profile_meta_v1";

const MemoryBankMetaSchema = z.object({
  updatedAt: z.string().min(1),
  ownerId: z.string().nullable().default(null),
});
type MemoryBankMeta = z.infer<typeof MemoryBankMetaSchema>;

/**
 * «Локально ще ніколи не писали» — той самий EPOCH-sentinel, що й
 * `biometrics.ts`. Легасі-факти (записані ДО цього фіксу) теж читають цей
 * дефолт для МІТКИ ЧАСУ — сама мітка просто не існувала — але це НЕ
 * означає, що вони порожні: emptiness перевіряємо за `entries.length`,
 * не за міткою (див. `reconcileMemoryBankWithServerProfile`).
 */
export const MEMORY_BANK_META_EPOCH = new Date(0).toISOString();

const MEMORY_BANK_META_DEFAULT: MemoryBankMeta = {
  updatedAt: MEMORY_BANK_META_EPOCH,
  ownerId: null,
};

/**
 * Юзер поточної сесії пристрою — той самий патерн, що
 * `currentBiometricsOwner` у `biometrics.ts` (CodeRabbit PR #627).
 * Виставляється з `useProfileWriteThroughBoot` при кожній зміні `userId`.
 */
let currentMemoryBankOwner: string | null = null;

export function setMemoryBankOwner(userId: string | null): void {
  currentMemoryBankOwner = userId;
}

export function readMemoryBankMeta(): MemoryBankMeta {
  return safeReadLSValidated(
    MEMORY_BANK_META_KEY,
    MemoryBankMetaSchema,
    MEMORY_BANK_META_DEFAULT,
  );
}

/** Дзеркало `readBiometricsOwnerId` — власник ОСТАННЬОГО запису в `PROFILE_KEY`. */
export function readMemoryBankOwnerId(): string | null {
  return readMemoryBankMeta().ownerId;
}

function writeMemoryBankMeta(updatedAt: string): void {
  safeWriteLS(MEMORY_BANK_META_KEY, {
    updatedAt,
    ownerId: currentMemoryBankOwner,
  });
}

// `icon` — імʼя з атласу дизайн-системи (`@shared/components/ui/Icon`).
// До 2026-08-03 поле звалось `emoji` і містило системні emoji-гліфи.
export const CATEGORY_META: Record<string, { label: string; icon: IconName }> =
  {
    allergy: { label: "Алергії", icon: "alert-triangle" },
    diet: { label: "Дієта", icon: "leaf" },
    goal: { label: "Цілі", icon: "target" },
    training: { label: "Тренування", icon: "dumbbell" },
    health: { label: "Здоровʼя", icon: "heart" },
    preference: { label: "Уподобання", icon: "sparkles" },
    other: { label: "Інше", icon: "pen" },
  };

/**
 * Видимий текст кнопок секції «Памʼять ШІ». Це рівно те, що читається
 * бульбашкою «від користувача» в чаті.
 *
 * AI-CONTEXT: до 2026-08-05 тут жила семирядкова інструкція («запитуй по
 * одному питанню», «покажи резюме і попроси підтвердити кожен пункт»…).
 * Три причини, чому вона поїхала на сервер (`chatPresets.ts`, preset
 * `profile_interview`):
 *
 *   1. Вона суперечила системному промпту. Той наказує зберігати факти
 *      автоматично й не питати дозволу — це ратифіковане продуктове
 *      рішення (`docs/01-product/model/hub-coach.md` § 6.4, «Auto-remember
 *      + памʼять прозора»). Інструкція вимагала протилежного, і кожна
 *      модель розвʼязувала конфлікт по-своєму.
 *   2. Сценарій не влазив у Free-ліміт: інтервʼю «по одному питанню» +
 *      раунд підтверджень ≈ 8-10 запитів проти 5 на добу.
 *   3. Сім рядків правил назавжди осідали в історії чату як репліка
 *      користувача — і в `hub_chat_history`, і в бекапі.
 */
export const MEMORY_ONBOARDING_PROMPT =
  "Заповни мій профіль у памʼяті ШІ, постав мені кілька питань.";

export const MEMORY_ADD_INFO_PROMPT = "Хочу додати щось про себе.";

export const MEMORY_MANUAL_STEPS = [
  {
    category: "goal",
    label: "Фокус",
    prompt: "Що для тебе зараз найважливіше?",
    placeholder: "Наприклад: хочу стабільно тренуватись 3 рази на тиждень",
  },
  {
    category: "preference",
    label: "Вподобання",
    prompt: "Які вподобання, правила або обмеження варто враховувати?",
    placeholder: "Наприклад: не люблю ранкові тренування",
  },
  {
    category: "training",
    label: "Типовий день",
    prompt: "Як зараз виглядає твій типовий день або тиждень?",
    placeholder: "Наприклад: сидяча робота, вечорами є 30 хвилин",
  },
  {
    category: "other",
    label: "Нагадування",
    prompt: "Як тобі зручніше отримувати нагадування та поради?",
    placeholder: "Наприклад: коротко, без тиску, ближче до вечора",
  },
] as const;

export interface MemoryImportPreview {
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  newEntries: MemoryEntry[];
}

export function normalizeMemoryCategory(category?: string): string {
  const key = (category || "other").trim().toLowerCase();
  return key || "other";
}

/** Категорія входить у канонічний набір (= ключі `CATEGORY_META`). */
export function isKnownMemoryCategory(category: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATEGORY_META, category);
}

/**
 * Категорія на ЗАПИС: невідоме значення зводимо в `other`.
 *
 * Серверна схема `remember` віддає `enum` (`toolDefs/memory.ts`), але це
 * гарантія лише для Anthropic-моделей у strict-режимі — під OpenRouter-шлюзом
 * strict ігнорується, тож валідне значення тут не аксіома. Без зведення
 * невідома категорія створює в секції «Памʼять ШІ» групу з сирим ключем
 * замість людської назви та іконки.
 *
 * На ЧИТАННЯ (`normalizeMemoryEntry`) навмисно лишаємо як є: легасі-записи
 * з доенумної доби не переписуємо мовчки під користувачем.
 */
export function toWritableMemoryCategory(category?: string): string {
  const key = normalizeMemoryCategory(category);
  return isKnownMemoryCategory(key) ? key : "other";
}

export function normalizeMemoryEntry(item: unknown): MemoryEntry | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj["fact"] !== "string") return null;
  const fact = obj["fact"].trim();
  if (!fact) return null;
  return {
    id:
      typeof obj["id"] === "string" && obj["id"].trim()
        ? obj["id"].trim()
        : makeMemoryId(),
    fact,
    category:
      typeof obj["category"] === "string"
        ? normalizeMemoryCategory(obj["category"])
        : "other",
    createdAt:
      typeof obj["createdAt"] === "string" && obj["createdAt"].trim()
        ? obj["createdAt"]
        : new Date().toISOString(),
  };
}

export function buildMemoryImportPreview(
  existing: MemoryEntry[],
  parsed: unknown[],
): MemoryImportPreview {
  const existingIds = new Set(existing.map((entry) => entry.id));
  const existingFacts = new Set(
    existing.map((entry) => entry.fact.trim().toLowerCase()),
  );
  const incomingIds = new Set<string>();
  const incomingFacts = new Set<string>();
  const newEntries: MemoryEntry[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const item of parsed) {
    const entry = normalizeMemoryEntry(item);
    if (!entry) {
      invalidCount += 1;
      continue;
    }
    validCount += 1;

    const factKey = entry.fact.trim().toLowerCase();
    const duplicate =
      existingIds.has(entry.id) ||
      existingFacts.has(factKey) ||
      incomingIds.has(entry.id) ||
      incomingFacts.has(factKey);

    if (duplicate) {
      duplicateCount += 1;
      continue;
    }

    incomingIds.add(entry.id);
    incomingFacts.add(factKey);
    newEntries.push(entry);
  }

  return { validCount, invalidCount, duplicateCount, newEntries };
}

export function readMemoryEntries(): MemoryEntry[] {
  const parsed = safeReadLS<unknown[]>(PROFILE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeMemoryEntry(item))
    .filter((item): item is MemoryEntry => item !== null);
}

/**
 * Підписники на зміну банку памʼяті В МЕЖАХ ЦІЄЇ ВКЛАДКИ.
 *
 * WHY. Банк пишуть дві незалежні поверхні: екран «Памʼять ШІ» і виконавці
 * чат-інструментів (`remember` / `forget`). Чат при цьому відкривається
 * ОВЕРЛЕЄМ поверх екрана, тобто екран не перемонтовується і свій
 * `useState`-знімок не переливає — список під оверлеєм лишався таким, яким
 * був до розмови, разом із лічильником у шапці. Гірше: `openMemoryChat`
 * обирає режим (інтервʼю чи доповнення) за тим самим застарілим `length`.
 *
 * `window.storage` тут не рятує принципово: він не спрацьовує у вкладці, яка
 * сама зробила запис. Тому нотифікація йде з єдиного писаря — так її не
 * можна забути додати на новому call-site.
 */
type MemoryBankListener = (entries: MemoryEntry[]) => void;

const listeners = new Set<MemoryBankListener>();

/**
 * L-8: підписники на САМЕ ЛОКАЛЬНІ записи (протилежність — гідратація з
 * сервера, `writeMemoryEntriesFromServer`, яка НЕ сповіщає цей канал).
 * `profileWriteThrough.ts`/`useProfileWriteThroughBoot.ts` підписуються
 * сюди, щоб пуштонути write-through після кожного локального збереження —
 * так само, як `useBiometrics.saveBiometrics` пушить біометрію. Окремий
 * канал від `subscribeMemoryEntries` (UI-реактивність) навмисно: якби
 * гідратація теж проходила через нього, вона одразу тригерила б пуш тих
 * самих щойно отриманих даних НАЗАД на сервер по колу.
 */
const localEditListeners = new Set<MemoryBankListener>();

export function subscribeMemoryEntries(fn: MemoryBankListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function subscribeLocalMemoryEdit(fn: MemoryBankListener): () => void {
  localEditListeners.add(fn);
  return () => {
    localEditListeners.delete(fn);
  };
}

function notify(set: Set<MemoryBankListener>, entries: MemoryEntry[]): void {
  // Підписник, який кинув виняток, не має ховати сам запис — він уже
  // стався — і не має заважати решті підписників.
  for (const fn of set) {
    try {
      fn(entries);
    } catch {}
  }
}

export function writeMemoryEntries(entries: MemoryEntry[]): void {
  // Profile entries dual-write to SQLite via the `useStorage()` per-row
  // path; the LS slot is a hub-side warm cache. Cross-device sync flows
  // through the v2 op-log writer-runtime, not LS-key-watcher, so a plain
  // `safeWriteLS` is enough here.
  if (!safeWriteLS(PROFILE_KEY, entries)) {
    throw new Error("Не вдалося зберегти памʼять профілю");
  }
  // L-8: генуїнний ЛОКАЛЬНИЙ запис — нова мітка часу ("зараз") + поточний
  // owner, які `profileWriteThrough.ts` звіряє з сервером на наступному
  // boot-і (і які тригерять write-through push через `localEditListeners`
  // нижче).
  writeMemoryBankMeta(new Date().toISOString());
  notify(listeners, entries);
  notify(localEditListeners, entries);
}

/**
 * L-8: гідратація з сервера (`reconcileMemoryBankWithServerProfile`) — НЕ
 * "локальний запис". Мітка часу приходить ГОТОВОЮ із сервера (не
 * "зараз", інакше наступний reconcile помилково вважав би щойно
 * гідрований локальний кеш "новішим" за той самий сервер), і
 * `localEditListeners` навмисно НЕ сповіщаються (див. коментар вище).
 */
export function writeMemoryEntriesFromServer(
  entries: MemoryEntry[],
  serverUpdatedAt: string,
): void {
  if (!safeWriteLS(PROFILE_KEY, entries)) {
    throw new Error("Не вдалося зберегти памʼять профілю");
  }
  writeMemoryBankMeta(serverUpdatedAt);
  notify(listeners, entries);
}

export function groupMemoryEntries(
  entries: MemoryEntry[],
): Record<string, MemoryEntry[]> {
  const map: Record<string, MemoryEntry[]> = {};
  for (const entry of entries) {
    const cat = normalizeMemoryCategory(entry.category);
    if (!map[cat]) map[cat] = [];
    map[cat].push(entry);
  }
  return map;
}

export function memoryStorageSize(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "0 B";
  const bytes = new Blob([JSON.stringify(entries)]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function upsertMemoryFact(
  entries: MemoryEntry[],
  fact: string,
  category?: string,
): { entries: MemoryEntry[]; entry: MemoryEntry; created: boolean } {
  const normalizedFact = fact.trim();
  if (!normalizedFact) throw new Error("Потрібен факт для запамʼятовування.");

  const normalizedCategory = toWritableMemoryCategory(category);
  const existingIndex = entries.findIndex(
    (entry) => entry.fact.trim().toLowerCase() === normalizedFact.toLowerCase(),
  );

  if (existingIndex >= 0) {
    const existingEntry = entries[existingIndex];
    if (!existingEntry) {
      throw new Error("Не вдалося оновити запис памʼяті.");
    }
    const updated: MemoryEntry = {
      ...existingEntry,
      fact: normalizedFact,
      category: normalizedCategory,
    };
    const next = [...entries];
    next[existingIndex] = updated;
    return { entries: next, entry: updated, created: false };
  }

  const entry = {
    id: makeMemoryId(),
    fact: normalizedFact,
    category: normalizedCategory,
    createdAt: new Date().toISOString(),
  };
  return { entries: [entry, ...entries], entry, created: true };
}

export function removeMemoryEntry(
  entries: MemoryEntry[],
  id: string,
): { entries: MemoryEntry[]; removed: MemoryEntry | null } {
  const normalizedId = id.trim();
  const removed = entries.find((entry) => entry.id === normalizedId) ?? null;
  if (!removed) return { entries, removed: null };
  return {
    entries: entries.filter((entry) => entry.id !== normalizedId),
    removed,
  };
}

export function makeMemoryId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `mem_${Date.now().toString(36)}_${crypto.randomUUID()}`
  );
}
