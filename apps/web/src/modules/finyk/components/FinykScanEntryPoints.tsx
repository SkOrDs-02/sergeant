/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Точка входу в чек-скан v1 і масове ведення (Фаза 2) — спека
 * `docs/90-work/planning/specs/receipt-scan.md` § Флоу v1 / § Фаза 2.
 *
 * UX-РІШЕННЯ (задокументовано в звіті web-agent-а PR #818, розходиться з
 * буквальним текстом спеки "кнопка ... поруч із «+ Витрата» на сторінці
 * транзакцій"): існуючий `FloatingActionButton` у `FinykApp.tsx` уже й
 * так глобальний для ВСІХ сторінок модуля (не лише "Операції"), а не
 * привʼязаний до сторінки транзакцій. Замість другої, сторінко-локальної
 * кнопки — розширено ТОЙ САМИЙ FAB до fan-menu (`actions`, вже готова
 * можливість `FloatingActionButton`) з трьома діями: «Додати витрату»
 * (наявна поведінка), «Сканувати чек» (одне чи кілька фото — батч живе
 * там, бета-фідбек №2 2026-08-18), «Додати документи» (скрін/CSV). Це
 * найменш-інвазивний шлях (мінус друга кнопка, мінус друга copy-поверхня)
 * і дає доступ до сканування з БУДЬ-ЯКОЇ сторінки модуля — строго ширше
 * покриття, ніж буквальна вимога спеки.
 *
 * Обидва sheet-и — ліниві (`lazyReceiptSheets.ts`, той самий
 * `lazyImport` патерн, що `pages/lazyPages.ts`) і монтуються лише коли
 * користувач реально тапнув дію — жоден зайвий байт не йде в eager-бандл
 * (280 kB gate), і `vendor-zxing` (камерний QR-сканер) довантажується
 * лише в момент відкриття `ReceiptScanSheet`.
 *
 * Suspense fallback — легкий Spinner, не `null` (CodeRabbit round 5, PR
 * #818): користувач щойно тапнув дію у FAB-меню — свідомий жест, а не
 * фонове preload. `null` під час завантаження чанка (JS цього sheet-а +
 * `vendor-zxing` для сканера) на повільному звʼязку виглядав би так, ніби
 * тап взагалі нічого не зробив.
 */
import { Suspense, useState } from "react";
import { FloatingActionButton } from "@shared/components/ui/FloatingActionButton";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { Spinner } from "@shared/components/ui/Spinner";
import { useToast } from "@shared/hooks/useToast";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import type { ManualExpenseWriteThroughStorage } from "../hooks/manualExpenseWriteThrough";
import { BulkImportSheet, ReceiptScanSheet } from "./lazyReceiptSheets";

/** Shared between both lazy sheets below — matches `Sheet`'s own backdrop
 * treatment (`bg-black/40 backdrop-blur-sm`, `Sheet.tsx`) so the fallback
 * reads as "the sheet is opening", not a separate flash of UI. */
function SheetOpeningFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Відкриваю…"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <Spinner size="lg" />
    </div>
  );
}

export interface FinykScanEntryPointsProps {
  onAddExpense: () => void;
  storage: ManualExpenseWriteThroughStorage;
  onReceiptLinked: (txRef: string, receiptId: number) => void;
  customCategories?: readonly CustomCategoryInput[] | undefined;
}

export function FinykScanEntryPoints({
  onAddExpense,
  storage,
  onReceiptLinked,
  customCategories,
}: FinykScanEntryPointsProps) {
  const toast = useToast();
  const [showReceiptScan, setShowReceiptScan] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);

  return (
    <>
      <FloatingActionButton
        variant="v2-finyk"
        icon="plus"
        aria-label="Додати"
        actions={[
          {
            id: "expense",
            icon: "plus",
            label: "Додати витрату",
            onClick: onAddExpense,
          },
          {
            id: "scan-receipt",
            icon: "scanner",
            label: "Сканувати чек",
            onClick: () => setShowReceiptScan(true),
          },
          {
            id: "bulk-import",
            icon: "upload",
            label: "Додати документи",
            onClick: () => setShowBulkImport(true),
          },
        ]}
      />

      {showReceiptScan && (
        <SectionErrorBoundary title="Не вдалось відкрити сканер чеків">
          <Suspense fallback={<SheetOpeningFallback />}>
            <ReceiptScanSheet
              open={showReceiptScan}
              onClose={() => setShowReceiptScan(false)}
              storage={storage}
              onReceiptLinked={onReceiptLinked}
              onSaved={(alreadyExists) => {
                if (alreadyExists) {
                  toast.info("Цей чек уже збережено.");
                } else {
                  toast.success("Чек збережено.");
                }
              }}
              customCategories={customCategories}
            />
          </Suspense>
        </SectionErrorBoundary>
      )}

      {showBulkImport && (
        <SectionErrorBoundary title="Не вдалось відкрити масовий імпорт">
          <Suspense fallback={<SheetOpeningFallback />}>
            <BulkImportSheet
              open={showBulkImport}
              onClose={() => setShowBulkImport(false)}
              storage={storage}
              customCategories={customCategories}
            />
          </Suspense>
        </SectionErrorBoundary>
      )}
    </>
  );
}
