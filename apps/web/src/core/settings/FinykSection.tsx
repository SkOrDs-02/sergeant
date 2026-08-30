/**
 * Востаннє перевірено: 2026-07-16
 * Статус: Активний
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { useInView } from "@shared/hooks/useInView";
import { useStorage as useFinykStorage } from "@finyk/hooks/useStorage";
import { FinykPrivatBankSection } from "./FinykPrivatBankSection";
import { FinykWebhookServiceSection } from "./FinykWebhookServiceSection";
import { SilpoIntegrationSection } from "./SilpoIntegrationSection";
import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

// ПриватБанк-секція готова, але без live-rollout рішення лишається за
// env-прапорцем (дефолт off), той самий патерн, що інші env-гейти web
// (напр. `VITE_POSTHOG_KEY`, `VITE_TARGET` у `core/observability/posthog.ts`
// / `main.tsx`) — bracket-доступ, бо ключ не в локальному `ImportMetaEnv`
// (`vite-env.d.ts` декларує лише `VITE_BUILD_ID` / `VITE_TARGET`, інжектовані
// unconditionally через `vite.config.js#define`).
const PRIVAT_ENABLED = import.meta.env["VITE_PRIVAT_ENABLED"] === "true";

interface CustomCategory {
  id: string;
  label: string;
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
  addCustomCategory: (label: string) => void;
  removeCustomCategory: (id: string) => void;
  addManualExpense: (expense: ManualExpenseDraft) => void;
}

export function FinykSection() {
  // Відкладаємо Monobank-запит і poller backfill, доки секція вперше не
  // потрапить у viewport. Після першого входження useInView лишається true.
  const [sectionRef, inView] = useInView();
  const {
    customCategories,
    addCustomCategory,
    removeCustomCategory,
    addManualExpense,
  } = useFinykStorage({}) as FinykStorageShape;
  const [newCategoryLabel, setNewCategoryLabel] = useState("");

  const addCategory = () => {
    addCustomCategory(newCategoryLabel);
    setNewCategoryLabel("");
  };

  const catInputClass =
    "input-focus-finyk flex-1 min-w-0 h-11 rounded-xl border border-line bg-panelHi px-3 text-style-body text-text";

  return (
    <div ref={sectionRef}>
      {/* V-13 (аудит Профілю/Налаштувань 2026-08-08): `SettingsGroup`
          фарбує бейдж модульним акцентом лише коли задані ОБИДВА — `icon`
          і `module`. Без другого всі чотири модульні секції вкладки
          «Розділи» падали на спільний сірий фолбек. */}
      <SettingsGroup
        title="Фінік"
        icon="credit-card"
        module="finyk"
        anchorId="settings-finyk"
      >
        <SettingsSubGroup title="Власні категорії витрат">
          <p className="text-style-caption text-subtle leading-snug">
            Додаються до списку категорій у транзакціях, сплітах і лімітах.
            Іконка підбирається автоматично, емодзі в назві не потрібне.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryLabel}
              onChange={(event) => setNewCategoryLabel(event.target.value)}
              placeholder="Напр. Хобі"
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
            >
              Додати
            </Button>
          </div>
          {customCategories.length > 0 ? (
            <ul className="space-y-0 -mx-4">
              {customCategories.map((category) => (
                <li
                  key={category.id}
                  className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line last:border-0"
                >
                  <span className="text-style-label truncate">
                    {category.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCustomCategory(category.id)}
                    className="text-style-label font-semibold text-danger-strong dark:text-danger hover:text-danger shrink-0"
                  >
                    Видалити
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              module="finyk"
              icon={<Icon name="tag" size={20} />}
              title="Поки немає власних категорій"
              description="Додай першу категорію вище, вона зʼявиться у списку транзакцій, сплітів і лімітів."
            />
          )}
        </SettingsSubGroup>

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
