/**
 * Востаннє перевірено: 2026-07-16
 * Статус: Активний
 */
import { useState } from "react";
import { messages } from "@shared/i18n/uk";
import { Segmented } from "@shared/components/ui/Segmented";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { useInView } from "@shared/hooks/useInView";
import { useStorage as useFinykStorage } from "@finyk/hooks/useStorage";
import { limitBudgetCategoryIds } from "@sergeant/finyk-domain/domain/budget";
import type { Budget } from "@sergeant/finyk-domain/domain/types";
import type { MerchantRule } from "@sergeant/finyk-domain/lib/merchantRules";
import { CollectionManager } from "@shared/components/ui/CollectionManager";
import { FinykMerchantRulesSection } from "./FinykMerchantRulesSection";
import { FinykPrivatBankSection } from "./FinykPrivatBankSection";
import { FinykWebhookServiceSection } from "./FinykWebhookServiceSection";
import { SilpoIntegrationSection } from "./SilpoIntegrationSection";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";

// ПриватБанк-секція готова, але без live-rollout рішення лишається за
// env-прапорцем (дефолт off), той самий патерн, що інші env-гейти web
// (напр. `VITE_POSTHOG_KEY`, `VITE_TARGET` у `core/observability/posthog.ts`
// / `main.tsx`) — bracket-доступ, бо ключ не в локальному `ImportMetaEnv`
// (`vite-env.d.ts` декларує лише `VITE_BUILD_ID` / `VITE_TARGET`, інжектовані
// unconditionally через `vite.config.js#define`).
// AI-NOTE: нове підключення ПриватБанку сховано рішенням власника 2026-09-30,
// поки у Привата немає API-токенів для користувачів. Код, серверні роути,
// міграції й дані НЕ видаляти — стек у режимі очікування (finyk.md § Privatbank).
// Дефолт off; не вмикай `VITE_PRIVAT_ENABLED` без нового рішення власника.
const PRIVAT_ENABLED = import.meta.env["VITE_PRIVAT_ENABLED"] === "true";

interface CustomCategory {
  id: string;
  label: string;
  kind?: "expense" | "income";
}

interface ManualExpenseDraft {
  id?: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  kind: "income" | "expense";
}

interface FinykStorageShape {
  customCategories: CustomCategory[];
  addCustomCategory: (
    label: string,
    options?: { kind?: "expense" | "income" },
  ) => void;
  removeCustomCategory: (id: string) => void;
  // Потрібні лише для підрахунку лімітів у тексті підтвердження; необовʼязкові,
  // бо «вужчий вигляд» хука терпить їх відсутність (мок у тестах).
  budgets?: readonly Budget[] | undefined;
  addManualExpense: (expense: ManualExpenseDraft) => void;
  // Правила категорій мерчантів. Необовʼязкові у цьому «вужчому вигляді» хука:
  // секція нижче терпить їх відсутність (мок `useStorage` у тестах).
  merchantRules?: readonly MerchantRule[] | undefined;
  deleteMerchantRule?: ((id: string) => MerchantRule[]) | undefined;
  restoreMerchantRules?: ((rules: readonly MerchantRule[]) => void) | undefined;
  // «Приховати суми»: до 2026-10-08 жило кнопкою-оком у шапці Фініка і
  // відбирало в назви модуля 44px на 375px (анти-слоп раунд 4, A3/Q5).
  // Необовʼязкові з тієї ж причини, що й правила мерчантів: мок хука в
  // тестах секції їх не дає.
  showBalance?: boolean | undefined;
  setShowBalance?: ((next: boolean) => void) | undefined;
}

const NO_MERCHANT_RULES: readonly MerchantRule[] = [];

export function FinykSection() {
  // Відкладаємо Monobank-запит і poller backfill, доки секція вперше не
  // потрапить у viewport. Після першого входження useInView лишається true.
  const [sectionRef, inView] = useInView();
  const {
    customCategories,
    addCustomCategory,
    removeCustomCategory,
    budgets,
    addManualExpense,
    merchantRules,
    deleteMerchantRule,
    restoreMerchantRules,
    showBalance = true,
    setShowBalance,
  } = useFinykStorage({}) as FinykStorageShape;
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryKind, setNewCategoryKind] = useState<"expense" | "income">(
    "expense",
  );

  // Категорія, що чекає підтвердження видалення. Видалення необоротне
  // (ліміти лише з цією категорією зникають), тож без підтвердження не йдемо.
  const [pendingDelete, setPendingDelete] = useState<CustomCategory | null>(
    null,
  );
  const soleLimitsCount = pendingDelete
    ? (Array.isArray(budgets) ? budgets : []).filter(
        (b) =>
          b.type === "limit" &&
          limitBudgetCategoryIds(b).length === 1 &&
          limitBudgetCategoryIds(b)[0] === pendingDelete.id,
      ).length
    : 0;

  const addCategory = () => {
    if (customCategories.length >= 80) return;
    if (newCategoryKind === "income") {
      addCustomCategory(newCategoryLabel, { kind: "income" });
    } else {
      addCustomCategory(newCategoryLabel);
    }
    setNewCategoryLabel("");
  };

  const catInputClass =
    "input-focus-finyk flex-1 min-w-0 h-11 rounded-lg border border-line bg-panelHi px-3 text-style-body text-text";

  return (
    <div ref={sectionRef}>
      {/* V-13 (аудит Профілю/Налаштувань 2026-08-08): `SettingsGroup`
          фарбує бейдж модульним акцентом лише коли задані ОБИДВА — `icon`
          і `module`. Без другого всі чотири модульні секції вкладки
          «Розділи» падали на спільний сірий фолбек. */}
      <SettingsGroup title="Фінік" anchorId="settings-finyk">
        {setShowBalance ? (
          <SettingsSubGroup variant="bounded" title="Показ сум">
            <ToggleRow
              label="Приховувати суми"
              description="Баланс, бюджети, аналітика й суми на головному екрані показують «••••» замість чисел. Операції в Фініку лишаються видимими."
              checked={!showBalance}
              onChange={(hide) => setShowBalance(!hide)}
            />
          </SettingsSubGroup>
        ) : null}
        <CollectionManager
          title="Власні категорії"
          count={customCategories.length}
          limit={80}
          description={messages.collection.finykCategoriesDescription}
        >
          {(query) => {
            const visibleCategories = customCategories.filter(
              (category) =>
                (category.kind ?? "expense") === newCategoryKind &&
                category.label.toLocaleLowerCase("uk-UA").includes(query),
            );
            return (
              <>
                <Segmented
                  layout="bar"
                  semantics="filter"
                  ariaLabel={messages.collection.categoryKindLabel}
                  value={newCategoryKind}
                  onChange={setNewCategoryKind}
                  items={[
                    { value: "expense", label: "Витрата" },
                    { value: "income", label: "Надходження" },
                  ]}
                />

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryLabel}
                    onChange={(event) =>
                      setNewCategoryLabel(event.target.value)
                    }
                    placeholder={"Назва категорії"}
                    aria-label={messages.collection.categoryNameLabel}
                    disabled={customCategories.length >= 80}
                    maxLength={80}
                    className={catInputClass}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && newCategoryLabel.trim()) {
                        addCategory();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    className="shrink-0 h-11 px-4"
                    onClick={addCategory}
                    disabled={
                      !newCategoryLabel.trim() || customCategories.length >= 80
                    }
                  >
                    Додати
                  </Button>
                </div>
                {customCategories.length >= 80 && (
                  <p className="text-style-body text-muted" role="status">
                    {messages.collection.limitReached.replace("{limit}", "80")}
                  </p>
                )}
                <p className="text-style-caption text-muted" role="status">
                  {messages.collection.foundLabel}: {visibleCategories.length}
                </p>
                {visibleCategories.length > 0 ? (
                  <ul className="divide-y divide-line">
                    {visibleCategories.map((category) => (
                      <li
                        key={category.id}
                        className="flex items-center justify-between gap-2 py-3"
                      >
                        <span className="min-w-0">
                          <span className="block text-style-label break-words">
                            {category.label}
                          </span>
                          <span className="block text-style-caption text-subtle">
                            {category.kind === "income"
                              ? "Надходження"
                              : "Витрата"}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          tone="danger"
                          onClick={() => setPendingDelete(category)}
                          className="shrink-0"
                          aria-label={messages.collection.categoryDeleteLabel.replace(
                            "{name}",
                            category.label,
                          )}
                        >
                          Видалити
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    compact
                    title={
                      customCategories.length === 0
                        ? "Поки немає власних категорій"
                        : messages.collection.categoryEmptySearch
                    }
                    description="Додай першу категорію вище, вона зʼявиться у списку операцій, сплітів і лімітів."
                  />
                )}
                <ConfirmDialog
                  open={pendingDelete !== null}
                  title="Видалити категорію?"
                  description={
                    <>
                      Категорію «{pendingDelete?.label}» буде видалено. Ліміти
                      лише з цією категорією буде видалено
                      {soleLimitsCount > 0
                        ? ` (зараз їх: ${soleLimitsCount})`
                        : ""}
                      ; в комбінованих лімітах вона просто зникне зі списку. Дію
                      не можна скасувати.
                    </>
                  }
                  confirmLabel="Видалити"
                  onConfirm={() => {
                    if (pendingDelete) removeCustomCategory(pendingDelete.id);
                    setPendingDelete(null);
                  }}
                  onCancel={() => setPendingDelete(null)}
                />
              </>
            );
          }}
        </CollectionManager>

        <FinykMerchantRulesSection
          rules={merchantRules ?? NO_MERCHANT_RULES}
          customCategories={customCategories}
          deleteMerchantRule={deleteMerchantRule}
          restoreMerchantRules={restoreMerchantRules}
        />

        <FinykWebhookServiceSection inView={inView} />
        <SilpoIntegrationSection
          inView={inView}
          addManualExpense={addManualExpense}
        />
        <FinykPrivatBankSection enabled={PRIVAT_ENABLED} />
      </SettingsGroup>
    </div>
  );
}
