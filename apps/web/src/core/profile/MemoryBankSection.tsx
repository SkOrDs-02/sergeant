import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pluralUa, type UaPluralForms } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { EmptyState } from "@shared/components/ui/EmptyState";
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
  subscribeMemoryEntries,
  upsertMemoryFact,
  writeMemoryEntries,
  type MemoryImportPreview,
} from "./memoryBank";
import type { MemoryEntry } from "./types";

interface PendingImport extends MemoryImportPreview {
  fileName: string;
}

const MEMORY_ENTRY_FORMS: UaPluralForms = {
  one: "запис",
  few: "записи",
  many: "записів",
};

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

  /**
   * Банк пишуть дві поверхні: цей екран і виконавці чат-інструментів
   * (`remember` / `forget`). Чат відкривається ОВЕРЛЕЄМ поверх екрана, тож
   * екран не перемонтовується — без підписки список і лічильник у шапці
   * лишались такими, якими були до розмови. `openMemoryChat` до того ж
   * обирає режим за `entries.length`, тобто застарілий знімок ще й ламав
   * вибір між інтервʼю і доповненням.
   */
  useEffect(() => subscribeMemoryEntries(setEntries), []);

  // Іменований function expression: retry у тості кличе сам себе, а `const`
  // ще в TDZ у момент створення замикання.
  const saveEntries = useCallback(
    function persist(next: MemoryEntry[]) {
      setEntries(next);
      try {
        writeMemoryEntries(next);
      } catch {
        // Запис у local-first сховище падає на квоті — стан минущий
        // (користувач звільнив місце / закрив іншу вкладку), тож повтор
        // із тим самим `next` має шанс і це єдиний шлях не втратити зміну.
        toast.error("Не вдалося зберегти памʼять профілю", undefined, {
          label: "Повторити",
          onClick: () => persist(next),
        });
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

  /**
   * Два режими розмови про профіль. Разом із повідомленням їде `preset`:
   * сама інструкція живе на сервері (`chatPresets.ts`), звідси йде лише
   * ідентифікатор. Preset також переводить розмову на окреме тижневе відро
   * AI-квоти, щоб заповнення профілю не зʼїдало денний ліміт.
   *
   * AI-CONTEXT (2026-08-07): режим більше НЕ виводиться з `entries.length`.
   * Раніше перший же запис назавжди перемикав кнопку на `profile_add_info`,
   * і повне інтервʼю ставало недосяжним — щоб пройти його вдруге, треба
   * було спорожнити банк. Вибір тепер за користувачем: обидві дії видимі.
   */
  const openMemoryChat = useCallback((mode: "interview" | "add") => {
    emitHubBus("openChat", {
      message:
        mode === "interview"
          ? MEMORY_ONBOARDING_PROMPT
          : MEMORY_ADD_INFO_PROMPT,
      autoSend: true,
      preset: mode === "interview" ? "profile_interview" : "profile_add_info",
    });
  }, []);

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
      // Тут і нижче recovery — НЕ «Повторити»: той самий файл впаде так
      // само. Єдиний реальний вихід — обрати інший, тож дія відкриває
      // файловий діалог (input ми щойно очистили, він готовий).
      const pickAnother = {
        label: "Обрати інший",
        onClick: () => importRef.current?.click(),
      };
      if (!isJsonFile) {
        toast.error("Імпорт підтримує лише JSON-файли", undefined, pickAnother);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (!Array.isArray(parsed)) {
            toast.error("Невалідний формат файлу", undefined, pickAnother);
            return;
          }
          const preview = buildMemoryImportPreview(entries, parsed);
          if (preview.validCount === 0) {
            toast.error(
              "Файл не містить валідних записів",
              undefined,
              pickAnother,
            );
            return;
          }
          setPendingImport({ ...preview, fileName: file.name });
          toast.success("JSON прочитано. Перевір підсумок і підтвердь імпорт.");
        } catch {
          toast.error("Не вдалося прочитати файл", undefined, pickAnother);
        }
      };
      reader.onerror = () => {
        toast.error("Не вдалося прочитати файл", undefined, pickAnother);
      };
      reader.readAsText(file);
    },
    [entries, toast],
  );

  const confirmImport = useCallback(() => {
    if (!pendingImport) return;
    if (pendingImport.newEntries.length === 0) {
      // Не помилка: файл валідний, просто всі записи вже є. `info` без
      // дії — користувачу нема що «повторювати» чи виправляти.
      toast.info("Немає нових записів, усі вже в памʼяті");
      return;
    }
    saveEntries([...entries, ...pendingImport.newEntries]);
    const added = pendingImport.newEntries.length;
    setPendingImport(null);
    toast.success(
      `Імпортовано ${added} ${pluralUa(added, MEMORY_ENTRY_FORMS)}`,
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
      {/* V-4 (deep-module-audit 2026-08-08, § «Профіль і Налаштування»):
          цей `<div>` раніше малював власний текстовий заголовок
          «Памʼять ШІ» поверх `text-style-label` — БІЛЬШИМ за зовнішній
          `CollapsibleSection`-заголовок «Памʼять» (`SectionHeading
          size="xs"` у `ProfilePage.tsx`), тобто інверсія ієрархії:
          дрібніший зовнішній рівень над більшим вкладеним. Заголовок-текст
          прибрано, іконка й лічильник/розмір сховища (мета-інформація,
          заради якої шапка існує) лишились без змін. Зовнішній заголовок
          піднято до `headingSize="md"` (той самий `text-style-label`), щоб
          рівень над ним більше не міг стати дрібнішим за будь-який текст
          усередині — цей коментар канонічний, решта секцій Профілю з тим
          самим фіксом лише посилаються на нього. */}
      <div className="px-4 py-3.5 flex items-center gap-2 border-b border-line">
        <Icon name="sergeant" size={18} className="text-muted" />
        <span className="ml-auto text-style-caption text-muted">
          {entries.length} {pluralUa(entries.length, MEMORY_ENTRY_FORMS)}
          {" \u00b7 "}
          {storageSize}
        </span>
      </div>

      <div className="p-4">
        {isEmpty ? (
          // V-14 (аудит 2026-08-08): був саморобний стек div-ів — окремий
          // рецепт порожнього стану замість спільного `EmptyState`. Усі три
          // дії лишаються: `action`/`secondaryAction` — рідні слоти
          // примітиву, третю (імпорт) веземо через `tertiaryLink` — новий
          // проп у самому `EmptyState` заводити не можна, це не наш файл.
          <>
            <EmptyState
              size="sm"
              icon={
                <Icon name="sergeant" size={22} className="text-brand-500" />
              }
              title="Банк памʼяті порожній"
              description="ШІ задасть кілька запитань щоб дізнатися про ваші алергії, цілі, уподобання та рівень активності"
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => openMemoryChat("interview")}
                >
                  <Icon name="sergeant" size={14} className="mr-1.5" />
                  Заповнити профіль
                </Button>
              }
              secondaryAction={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setManualOpen(true)}
                >
                  Заповнити вручну
                </Button>
              }
              tertiaryLink={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => importRef.current?.click()}
                >
                  <Icon name="upload" size={14} className="mr-1.5" />
                  Імпорт
                </Button>
              }
            />
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImport}
            />
          </>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([cat, items]) => {
              const meta = CATEGORY_META[cat] || {
                label: cat,
                icon: "pen" as const,
              };
              return (
                <div key={cat}>
                  <div className="text-style-overline text-muted mb-2 flex items-center gap-1.5">
                    <Icon name={meta.icon} size="xs" aria-hidden />
                    {meta.label}
                  </div>
                  <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                    {items.map((entry) => (
                      <div
                        key={entry.id}
                        // V-9 (аудит 2026-08-08): факт — контент, заради
                        // якого секція існує; `truncate` різав його без
                        // жодного способу прочитати решту (ні title, ні
                        // розкриття). `items-start` тримає кнопку видалення
                        // біля верхнього краю тепер, коли факт може зайняти
                        // кілька рядків, а не зʼїжджає в середину блоку.
                        className="flex items-start gap-2 group"
                      >
                        <span className="text-style-label text-text flex-1 min-w-0 break-words">
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
                onClick={() => openMemoryChat("add")}
                className="flex-1 py-2.5 rounded-xl border border-dashed border-line text-style-label text-muted hover:text-text hover:border-muted transition-colors flex items-center justify-center gap-1.5"
              >
                <Icon name="plus" size={14} />
                Додати інфо
              </button>
              {/*
                Повне інтервʼю лишається доступним і з непорожнім банком:
                воно ставить ширші питання, ніж «додати інфо», і людина може
                захотіти пройти його ще раз — після зміни цілей, наприклад.
              */}
              <button
                type="button"
                onClick={() => openMemoryChat("interview")}
                className="py-2.5 px-3 rounded-xl border border-line text-style-label text-muted hover:text-text hover:border-muted transition-colors flex items-center justify-center gap-1.5"
              >
                <Icon name="sergeant" size={14} />
                Інтервʼю
              </button>
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="py-2.5 px-3 rounded-xl border border-line text-style-label text-muted hover:text-text hover:border-muted transition-colors flex items-center justify-center gap-1.5"
              >
                Вручну
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="py-2.5 px-3 rounded-xl border border-line text-style-label text-muted hover:text-text hover:border-muted transition-colors flex items-center justify-center gap-1.5"
                aria-label="Експорт памʼяті"
              >
                <Icon name="download" size={14} />
              </button>
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="py-2.5 px-3 rounded-xl border border-line text-style-label text-muted hover:text-text hover:border-muted transition-colors flex items-center justify-center gap-1.5"
                aria-label="Імпорт памʼяті"
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
              // V-14 (аудит 2026-08-08): третій саморобний рецепт
              // порожнього стану в цьому файлі — список нових записів для
              // імпорту порожній (усе виявилось дублями), і замість голого
              // <p> тепер той самий примітив, що й два інші.
              <EmptyState
                size="sm"
                variant="warning"
                // Іконка тут не декор: `variant` у `EmptyState` фарбує
                // РІВНО контейнер іконки і чип eyebrow — сам title/description
                // лишаються нейтральними завжди. Без жодного з двох слотів
                // `variant="warning"` — мертвий проп, і попереджувальний тон,
                // який до V-14 несло саме забарвлення тексту
                // (`text-warning-strong`), зник би при переїзді на примітив.
                icon={<Icon name="alert-triangle" size={18} />}
                title="Нових записів немає"
                description="Існуюча памʼять не буде перезаписана."
                className="mt-2"
              />
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
