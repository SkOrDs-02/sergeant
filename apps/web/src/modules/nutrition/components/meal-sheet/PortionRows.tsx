/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Блок «Порції» у формі власного продукту: нуль рядків за замовчуванням,
 * жоден не обовʼязковий. Валідація - `validatePortions` у `foodDraft.ts`.
 */
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { messages } from "@shared/i18n/uk";
import { PORTION_NAME_MAX_LEN } from "../../lib/foodDb/foodDb";
import {
  MAX_PORTIONS_PER_FOOD,
  newPortionDraft,
  type PortionDraft,
} from "./foodDraft";

interface PortionRowsProps {
  rows: PortionDraft[];
  errors?: Record<string, string>;
  onChange: (rows: PortionDraft[]) => void;
}

export function PortionRows({ rows, errors = {}, onChange }: PortionRowsProps) {
  const t = messages.nutrition.portionRows;
  const patch = (id: string, change: Partial<PortionDraft>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...change } : r)));

  return (
    <div className="space-y-2">
      <div className="text-style-caption text-text">{t.heading}</div>
      {/* AI-NOTE: підказка під заголовком блоку, а не текст для окремого читання. */}
      <p className="text-style-caption text-subtle">{t.hint}</p>
      {rows.map((row, index) => {
        const label = row.name.trim() || String(index + 1);
        const error = errors[row.id];
        return (
          <div key={row.id}>
            <div className="flex items-end gap-2">
              <div className="block min-w-0 flex-1">
                <span className="mb-1 block text-style-caption text-subtle">
                  {t.nameLabel}
                </span>
                <Input
                  value={row.name}
                  onChange={(event) =>
                    patch(row.id, { name: event.target.value })
                  }
                  placeholder={t.namePlaceholder}
                  maxLength={PORTION_NAME_MAX_LEN}
                  showCharCount={false}
                  aria-label={`Назва порції ${index + 1}`}
                />
              </div>
              <div className="block w-24 shrink-0">
                <span className="mb-1 block text-style-caption text-subtle">
                  {t.gramsLabel}
                </span>
                <Input
                  value={row.grams}
                  onChange={(event) =>
                    patch(row.id, { grams: event.target.value })
                  }
                  inputMode="decimal"
                  placeholder="30"
                  maxLength={8}
                  showCharCount={false}
                  aria-label={`Грами порції ${index + 1}`}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                className="min-h-[44px] min-w-[44px] shrink-0"
                aria-label={`Прибрати порцію ${label}`}
                onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
              >
                {t.remove}
              </Button>
            </div>
            {error && (
              <div className="mt-1 text-style-caption text-danger-strong dark:text-danger">
                {error}
              </div>
            )}
          </div>
        );
      })}
      {rows.length < MAX_PORTIONS_PER_FOOD && (
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] w-full"
          onClick={() => onChange([...rows, newPortionDraft()])}
        >
          {t.add}
        </Button>
      )}
    </div>
  );
}
