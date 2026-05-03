import {
  CATEGORY_META,
  readMemoryEntries,
  removeMemoryEntry,
  upsertMemoryFact,
  writeMemoryEntries,
} from "../../../profile/memoryBank";
import type {
  ChatActionResult,
  ForgetAction,
  MyProfileAction,
  RememberAction,
} from "../types";

export function remember(action: RememberAction): ChatActionResult {
  const { fact, category } = (action as RememberAction).input || {};
  try {
    const prevEntries = readMemoryEntries();
    const result = upsertMemoryFact(
      prevEntries,
      typeof fact === "string" ? fact : "",
      typeof category === "string" ? category : undefined,
    );
    writeMemoryEntries(result.entries);
    const meta = CATEGORY_META[result.entry.category];
    const label = meta?.label ?? result.entry.category;
    const resultStr = `${result.created ? "Запам'ятав" : "Оновив"}: ${result.entry.fact} (${label}, id:${result.entry.id})`;
    const entryId = result.entry.id;
    // Undo:
    // - якщо був created — просто видаляємо факт;
    // - якщо був updated — відновлюємо попередній entry з prevEntries.
    return {
      result: resultStr,
      undo: () => {
        if (result.created) {
          const cur = readMemoryEntries();
          const removed = removeMemoryEntry(cur, entryId);
          if (removed.removed) writeMemoryEntries(removed.entries);
          return;
        }
        const prev = prevEntries.find((e) => e.id === entryId);
        if (!prev) return;
        const cur = readMemoryEntries();
        const next = cur.map((e) => (e.id === entryId ? prev : e));
        writeMemoryEntries(next);
      },
    };
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Не вдалося зберегти факт у профіль.";
  }
}

export function forget(action: ForgetAction): string {
  const { fact_id } = (action as ForgetAction).input || {};
  const id = (fact_id || "").trim();
  if (!id) return "Потрібен id факту для видалення.";
  const result = removeMemoryEntry(readMemoryEntries(), id);
  if (!result.removed) return `Факт з id ${id} не знайдено.`;
  writeMemoryEntries(result.entries);
  return `Забув: ${result.removed.fact}`;
}

export function myProfile(action: MyProfileAction): string {
  const { category } = (action as MyProfileAction).input || {};
  const profile = readMemoryEntries();
  if (profile.length === 0) return "Профіль пам'яті порожній.";
  const cat = category?.trim().toLowerCase();
  const filtered = cat
    ? profile.filter((entry) => entry.category.toLowerCase() === cat)
    : profile;
  if (filtered.length === 0) {
    return `У профілі немає записів для категорії "${category}".`;
  }
  const parts = [`Профіль користувача (${filtered.length}):`];
  for (const entry of filtered) {
    const meta = CATEGORY_META[entry.category];
    parts.push(
      `  - [${meta?.label ?? entry.category}] ${entry.fact} (id:${entry.id})`,
    );
  }
  return parts.join("\n");
}
