import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Textarea } from "@shared/components/ui/Input";
import { useToast } from "@shared/hooks/useToast";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import {
  buildMemoryImportPreview,
  CATEGORY_META,
  groupMemoryEntries,
  MEMORY_ADD_INFO_PROMPT,
  MEMORY_MANUAL_STEPS,
  memoryStorageSize,
  MEMORY_ONBOARDING_PROMPT,
  readMemoryEntries,
  removeMemoryEntry,
  upsertMemoryFact,
  writeMemoryEntries,
  type MemoryImportPreview,
} from "./memoryBank";
import type { MemoryEntry } from "./types";

interface PendingImport extends MemoryImportPreview {
  fileName: string;
}

export function MemoryBankSection() {
  const toast = useToast();
  const importRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<MemoryEntry[]>(() =>
    readMemoryEntries(),
  );
  const [manualOpen, setManualOpen] = useState(false);
  const [manualStepIndex, setManualStepIndex] = useState(0);
  const [manualValue, setManualValue] = useState("");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(
    null,
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
      entries.length === 0 ? MEMORY_ONBOARDING_PROMPT : MEMORY_ADD_INFO_PROMPT;
    emitHubBus("openChat", { message: prompt, autoSend: true });
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
      setPendingImport(null);
      const isJsonFile =
        file.name.toLowerCase().endsWith(".json") ||
        file.type === "application/json";
      if (!isJsonFile) {
        toast.error("Імпорт підтримує лише JSON-файли");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (!Array.isArray(parsed)) {
            toast.error("Невалідний формат файлу");
            return;
          }
          const preview = buildMemoryImportPreview(entries, parsed);
          if (preview.validCount === 0) {
            toast.error("Файл не містить валідних записів");
            return;
          }
          setPendingImport({ ...preview, fileName: file.name });
          toast.success("JSON прочитано. Перевір підсумок і підтвердь імпорт.");
        } catch {
          toast.error("Не вдалося прочитати файл");
        }
      };
      reader.onerror = () => {
        toast.error("Не вдалося прочитати файл");
      };
      reader.readAsText(file);
    },
    [entries, toast],
  );

  const confirmImport = useCallback(() => {
    if (!pendingImport) return;
    if (pendingImport.newEntries.length === 0) {
      toast.error("Немає нових записів для імпорту");
      return;
    }
    saveEntries([...entries, ...pendingImport.newEntries]);
    const added = pendingImport.newEntries.length;
    setPendingImport(null);
    toast.success(
      `Імпортовано ${added} ${added === 1 ? "запис" : added < 5 ? "записи" : "записів"}`,
    );
  }, [entries, pendingImport, saveEntries, toast]);

  const closeManualFlow = useCallback(() => {
    setManualOpen(false);
    setManualStepIndex(0);
    setManualValue("");
  }, []);

  const saveManualStep = useCallback(() => {
    const step = MEMORY_MANUAL_STEPS[manualStepIndex];
    if (!step) return;
    const fact = manualValue.trim();
    if (fact) {
      const result = upsertMemoryFact(entries, fact, step.category);
      saveEntries(result.entries);
    }
    const nextIndex = manualStepIndex + 1;
    if (nextIndex >= MEMORY_MANUAL_STEPS.length) {
      closeManualFlow();
      toast.success("Памʼять профілю оновлено");
      return;
    }
    setManualStepIndex(nextIndex);
    setManualValue("");
  }, [
    closeManualFlow,
    entries,
    manualStepIndex,
    manualValue,
    saveEntries,
    toast,
  ]);

  const grouped = useMemo(() => groupMemoryEntries(entries), [entries]);
  const storageSize = useMemo(() => memoryStorageSize(entries), [entries]);
  const isEmpty = entries.length === 0;
  const manualStep = MEMORY_MANUAL_STEPS[manualStepIndex];

  return (
    <Card radius="lg" padding="none" className="overflow-hidden">
      <div className="px-4 py-3.5 flex items-center gap-2 border-b border-line">
        <Icon name="sparkle" size={18} className="text-muted" />
        <span className="text-style-label text-text">Пам&apos;ять ШІ</span>
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
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" size="sm" onClick={openMemoryChat}>
                <Icon name="sparkle" size={14} className="mr-1.5" />
                Заповнити профіль
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setManualOpen(true)}
              >
                Заповнити вручну
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
              accept=".json,application/json"
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
                          className="shrink-0 w-8 h-8 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] rounded-xl flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors"
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
                onClick={() => setManualOpen(true)}
                className="py-2.5 px-3 rounded-xl border border-line text-sm text-muted hover:text-text hover:border-muted transition-colors flex items-center justify-center gap-1.5"
              >
                Вручну
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
              accept=".json,application/json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
        )}
        {manualOpen && manualStep && (
          <div className="mt-4 rounded-2xl border border-line bg-panelHi/60 p-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-style-caption text-muted">
                  Крок {manualStepIndex + 1} з {MEMORY_MANUAL_STEPS.length} ·{" "}
                  {manualStep.label}
                </p>
                <p className="mt-1 text-style-label text-text">
                  {manualStep.prompt}
                </p>
              </div>
              <button
                type="button"
                onClick={closeManualFlow}
                className="shrink-0 rounded-xl p-2 text-muted hover:bg-panel hover:text-text"
                aria-label="Закрити ручне заповнення"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <Textarea
              id="memory-manual-step"
              className="mt-3 min-h-[88px]"
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              placeholder={manualStep.placeholder}
            />
            <p className="mt-2 text-style-caption text-muted">
              Цей шлях додає тільки записи профілю/памʼяті. Можна пропустити
              будь-яке питання.
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={saveManualStep}>
                Пропустити
              </Button>
              <Button variant="primary" size="sm" onClick={saveManualStep}>
                {manualStepIndex + 1 >= MEMORY_MANUAL_STEPS.length
                  ? "Завершити"
                  : "Зберегти і далі"}
              </Button>
            </div>
          </div>
        )}
        {pendingImport && (
          <div className="mt-4 rounded-2xl border border-line bg-panelHi/60 p-3 text-left">
            <p className="text-style-label text-text">
              Перевір імпорт: {pendingImport.fileName}
            </p>
            <p className="mt-1 text-style-caption text-muted">
              Валідних: {pendingImport.validCount}. Нових:{" "}
              {pendingImport.newEntries.length}. Дублів пропущено:{" "}
              {pendingImport.duplicateCount}. Помилкових рядків:{" "}
              {pendingImport.invalidCount}.
            </p>
            {pendingImport.newEntries.length > 0 ? (
              <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1">
                {pendingImport.newEntries.slice(0, 5).map((entry) => (
                  <li
                    key={entry.id}
                    className="truncate text-style-caption text-text"
                  >
                    {entry.fact}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-style-caption text-warning-strong dark:text-warning">
                Нових записів немає — існуюча памʼять не буде перезаписана.
              </p>
            )}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingImport(null)}
              >
                Скасувати
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={pendingImport.newEntries.length === 0}
                onClick={confirmImport}
              >
                Імпортувати нові
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
