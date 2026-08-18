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
 * прив'язаний до сторінки транзакцій. Замість другої, сторінко-локальної
 * кнопки — розширено ТОЙ САМИЙ FAB до fan-menu (`actions`, вже готова
 * можливість `FloatingActionButton`) з трьома діями: «Додати витрату»
 * (наявна поведінка), «Сканувати чек», «Додати документи». Це
 * найменш-інвазивний шлях (мінус друга кнопка, мінус друга copy-поверхня)
 * і дає доступ до сканування з БУДЬ-ЯКОЇ сторінки модуля — строго ширше
 * покриття, ніж буквальна вимога спеки.
 *
 * Обидва sheet-и — ліниві (`lazyReceiptSheets.ts`, той самий
 * `lazyImport` патерн, що `pages/lazyPages.ts`) і монтуються лише коли
 * користувач реально тапнув дію — жоден зайвий байт не йде в eager-бандл
 * (280 kB gate), і `vendor-zxing` (камерний QR-сканер) довантажується
 * лише в момент відкриття `ReceiptScanSheet`.
 */
import { Suspense, useState } from "react";
import { FloatingActionButton } from "@shared/components/ui/FloatingActionButton";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { useToast } from "@shared/hooks/useToast";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import type { ManualExpenseWriteThroughStorage } from "../hooks/manualExpenseWriteThrough";
import { BulkImportSheet, ReceiptScanSheet } from "./lazyReceiptSheets";

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
          <Suspense fallback={null}>
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
          <Suspense fallback={null}>
            <BulkImportSheet
              open={showBulkImport}
              onClose={() => setShowBulkImport(false)}
              storage={storage}
              onReceiptLinked={onReceiptLinked}
              customCategories={customCategories}
            />
          </Suspense>
        </SectionErrorBoundary>
      )}
    </>
  );
}
