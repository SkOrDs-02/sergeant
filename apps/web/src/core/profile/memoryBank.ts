import { STORAGE_KEYS } from "@sergeant/shared";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import type { MemoryEntry } from "./types";

export const PROFILE_KEY = STORAGE_KEYS.USER_PROFILE;

export const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  allergy: { label: "Алергії", emoji: "🚫" },
  diet: { label: "Дієта", emoji: "🍎" },
  goal: { label: "Цілі", emoji: "🎯" },
  training: { label: "Тренування", emoji: "🏋️" },
  health: { label: "Здоров'я", emoji: "💊" },
  preference: { label: "Уподобання", emoji: "⭐" },
  other: { label: "Інше", emoji: "📝" },
};

export const MEMORY_ONBOARDING_PROMPT =
  "Привіт! Давай заповнимо мій профіль. Задай мені по черзі кілька запитань: 1) Чи є в мене алергії або обмеження в їжі? 2) Яка моя дієта чи стиль харчування? 3) Яка моя основна ціль (схуднути, набрати масу, підтримка)? 4) Скільки разів на тиждень я тренуюсь і де? 5) Чи є щось ще важливе про моє здоров'я? Запам'ятай кожну відповідь через remember.";

export function normalizeMemoryCategory(category?: string): string {
  const key = (category || "other").trim().toLowerCase();
  return key || "other";
}

export function normalizeMemoryEntry(item: unknown): MemoryEntry | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.fact !== "string") return null;
  const fact = obj.fact.trim();
  if (!fact) return null;
  return {
    id:
      typeof obj.id === "string" && obj.id.trim()
        ? obj.id.trim()
        : makeMemoryId(),
    fact,
    category:
      typeof obj.category === "string"
        ? normalizeMemoryCategory(obj.category)
        : "other",
    createdAt:
      typeof obj.createdAt === "string" && obj.createdAt.trim()
        ? obj.createdAt
        : new Date().toISOString(),
  };
}

export function readMemoryEntries(): MemoryEntry[] {
  const parsed = safeReadLS<unknown[]>(PROFILE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeMemoryEntry(item))
    .filter((item): item is MemoryEntry => item !== null);
}

export function writeMemoryEntries(entries: MemoryEntry[]): void {
  // Profile entries dual-write to SQLite via the `useStorage()` per-row
  // path; the LS slot is a hub-side warm cache. Cross-device sync flows
  // through the v2 op-log writer-runtime, not LS-key-watcher, so a plain
  // `safeWriteLS` is enough here.
  if (!safeWriteLS(PROFILE_KEY, entries)) {
    throw new Error("Не вдалося зберегти пам'ять профілю");
  }
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
  if (!normalizedFact) throw new Error("Потрібен факт для запам'ятовування.");

  const normalizedCategory = normalizeMemoryCategory(category);
  const existingIndex = entries.findIndex(
    (entry) => entry.fact.trim().toLowerCase() === normalizedFact.toLowerCase(),
  );

  if (existingIndex >= 0) {
    const updated: MemoryEntry = {
      ...entries[existingIndex]!,
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
    `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  );
}
