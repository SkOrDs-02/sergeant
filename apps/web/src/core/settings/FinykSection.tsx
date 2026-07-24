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
import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

const PRIVAT_ENABLED = false;

interface CustomCategory {
  id: string;
  label: string;
}

interface FinykStorageShape {
  customCategories: CustomCategory[];
  addCustomCategory: (label: string) => void;
  removeCustomCategory: (id: string) => void;
}

export function FinykSection() {
  // Відкладаємо Monobank-запит і poller backfill, доки секція вперше не
  // потрапить у viewport. Після першого входження useInView лишається true.
  const [sectionRef, inView] = useInView();
  const { customCategories, addCustomCategory, removeCustomCategory } =
    useFinykStorage({}) as FinykStorageShape;
  const [newCategoryLabel, setNewCategoryLabel] = useState("");

  const addCategory = () => {
    addCustomCategory(newCategoryLabel);
    setNewCategoryLabel("");
  };

  const catInputClass =
    "input-focus-finyk flex-1 min-w-0 h-11 rounded-xl border border-line bg-panelHi px-3 text-style-body text-text";

  return (
    <div ref={sectionRef}>
      <SettingsGroup title="Фінік" icon="credit-card">
        <SettingsSubGroup title="Власні категорії витрат">
          <p className="text-style-caption text-subtle leading-snug">
            Додаються до списку категорій у транзакціях, сплітах і лімітах
            (можна вказати емодзі на початку назви).
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryLabel}
              onChange={(event) => setNewCategoryLabel(event.target.value)}
              placeholder="Напр. 🎨 Хобі"
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
                    className="text-style-label font-semibold text-danger/80 hover:text-danger shrink-0"
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
              description="Додай першу категорію вище — вона зʼявиться у списку транзакцій, сплітів і лімітів."
            />
          )}
        </SettingsSubGroup>

        <FinykWebhookServiceSection inView={inView} />
        <FinykPrivatBankSection enabled={PRIVAT_ENABLED} />
      </SettingsGroup>
    </div>
  );
}
