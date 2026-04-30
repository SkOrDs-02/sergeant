import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { emitHubBus } from "@shared/lib/hubBus";
import { showUndoToast } from "@shared/lib/undoToast";
import {
  CATEGORY_META,
  groupMemoryEntries,
  memoryStorageSize,
  MEMORY_ONBOARDING_PROMPT,
  normalizeMemoryEntry,
  readMemoryEntries,
  removeMemoryEntry,
  writeMemoryEntries,
} from "./memoryBank";
import type { MemoryEntry } from "./types";

export function MemoryBankSection() {
  const toast = useToast();
  const importRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<MemoryEntry[]>(() =>
    readMemoryEntries(),
  );

  const saveEntries = useCallback(
    (next: MemoryEntry[]) => {
      setEntries(next);
      try {
        writeMemoryEntries(next);
      } catch {
        toast.error("Не вдалося зберегти пам'ять профілю");
      }
    },
    [toast],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const previous = entries;
      const target = entries.find((e) => e.id === id);
      const result = removeMemoryEntry(entries, id);
      saveEntries(result.entries);
      if (!target) return;
      const factPreview =
        target.fact.length > 60 ? `${target.fact.slice(0, 60)}…` : target.fact;
      showUndoToast(toast, {
        msg: `Запис «${factPreview}» видалено`,
        onUndo: () => saveEntries(previous),
      });
    },
    [entries, saveEntries, toast],
  );

  const openMemoryChat = useCallback(() => {
    const prompt =
      entries.length === 0
        ? MEMORY_ONBOARDING_PROMPT
        : "Хочу додати інформацію про себе. Запитай мене що важливого я хочу щоб ти запам'ятав.";
    emitHubBus("openChat", { message: prompt });
  }, [entries.length]);

  const handleExport = useCallback(() => {
    const json = JSON.stringify(entries, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sergeant-memory-bank-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Експорт завершено");
  }, [entries, toast]);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (importRef.current) importRef.current.value = "";
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (!Array.isArray(parsed)) {
            toast.error("Невалідний формат файлу");
            return;
          }
          const valid = parsed
            .map((item: unknown) => normalizeMemoryEntry(item))
            .filter((item): item is MemoryEntry => item !== null);
          if (valid.length === 0) {
            toast.error("Файл не містить валідних записів");
            return;
          }
          const existingIds = new Set(entries.map((ent) => ent.id));
          const merged = [
            ...entries,
            ...valid.filter((entry) => !existingIds.has(entry.id)),
          ];
          saveEntries(merged);
          const added = merged.length - entries.length;
          toast.success(
            `Імпортовано ${added} ${added === 1 ? "запис" : added < 5 ? "записи" : "записів"}`,
          );
        } catch {
          toast.error("Не вдалося прочитати файл");
        }
      };
      reader.readAsText(file);
    },
    [entries, saveEntries, toast],
  );

  const grouped = useMemo(() => groupMemoryEntries(entries), [entries]);
  const storageSize = useMemo(() => memoryStorageSize(entries), [entries]);
  const isEmpty = entries.length === 0;

  return (
    <Card radius="lg" padding="none" className="overflow-hidden">
      <div className="px-4 py-3.5 flex items-center gap-2 border-b border-line">
        <Icon name="sparkle" size={18} className="text-muted" />
        <span className="text-sm font-semibold text-text">Пам&apos;ять ШІ</span>
        <span className="ml-auto text-xs text-muted">
          {entries.length}{" "}
          {entries.length === 1
            ? "запис"
            : entries.length < 5
              ? "записи"
              : "записів"}
          {" \u00b7 "}
          {storageSize}
        </span>
      </div>

      <div className="p-4">
        {isEmpty ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-3">
              <Icon name="sparkle" size={22} className="text-brand-500" />
            </div>
            <p className="text-sm text-muted mb-1">
              Банк пам&apos;яті порожній
            </p>
            <p className="text-xs text-muted/70 mb-4">
              ШІ задасть кілька запитань щоб дізнатися про ваші алергії, цілі,
              уподобання та рівень активності
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="primary" size="sm" onClick={openMemoryChat}>
                <Icon name="sparkle" size={14} className="mr-1.5" />
                Заповнити профіль
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => importRef.current?.click()}
              >
                <Icon name="upload" size={14} className="mr-1.5" />
                Імпорт
              </Button>
            </div>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([cat, items]) => {
              const meta = CATEGORY_META[cat] || { label: cat, emoji: "📝" };
              return (
                <div key={cat}>
                  <div className="text-eyebrow text-muted/70 mb-2">
                    {meta.label}
                  </div>
                  <div className="space-y-1">
                    {items.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-2 group"
                      >
                        <span className="text-sm text-text flex-1 min-w-0 truncate">
                          {entry.fact}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          aria-label={`Видалити: ${entry.fact}`}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={openMemoryChat}
                className="flex-1 py-2.5 rounded-xl border border-dashed border-line text-sm text-muted hover:text-text hover:border-muted transition-colors flex items-center justify-center gap-1.5"
              >
                <Icon name="plus" size={14} />
                Додати інфо
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="py-2.5 px-3 rounded-xl border border-line text-sm text-muted hover:text-text hover:border-muted transition-colors flex items-center justify-center gap-1.5"
                aria-label="Експорт пам'яті"
              >
                <Icon name="download" size={14} />
              </button>
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="py-2.5 px-3 rounded-xl border border-line text-sm text-muted hover:text-text hover:border-muted transition-colors flex items-center justify-center gap-1.5"
                aria-label="Імпорт пам'яті"
              >
                <Icon name="upload" size={14} />
              </button>
            </div>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
