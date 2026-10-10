/**
 * Last validated: 2026-07-29
 * Status: Active
 */
import { memo, useEffect, useId, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { MoneyInput } from "@shared/components/ui/MoneyInput";
import { Label } from "@shared/components/ui/FormField";
import { DateField } from "@shared/components/ui/DateField";
import { Icon } from "@shared/components/ui/Icon";

import { webKVStore } from "@shared/lib/storage/storage";
import {
  dismissNudge,
  // `formatMoney` лишається рівно для `aria-label` кнопки видалення:
  // там потрібен РЯДОК, а `Money` — це вузли. Видиме число на екрані
  // йде через `Money`, озвучене — через рядок; обидва з одних даних.
  formatMoney,
  isNudgeDismissed,
  pluralDays,
} from "@sergeant/shared";
import { Money } from "@shared/components/ui/Money";
import { useCelebration } from "@shared/components/ui/CelebrationModal";
import { JarSelector, type JarOption } from "../JarSelector";

interface GoalBudgetInput {
  id: string;
  type?: "goal" | "limit" | undefined;
  emoji?: string | undefined;
  name?: string | undefined;
  targetAmount: number;
  targetDate?: string | undefined;
  [extra: string]: unknown;
}

export interface GoalContributionLike {
  id: string;
  amountUah: number;
  date: string;
  note?: string | undefined;
}

interface GoalBudgetCardProps {
  budget: GoalBudgetInput;
  /** «Приховати суми» (PR-F3) — маскує прогрес/розбивку/історію поповнень. */
  showBalance?: boolean;
  /** Прогрес = баланс привʼязаної банки + сума ручних поповнень. */
  saved: number;
  pct: number;
  daysLeft: number | null;
  monthlyLabel?: string | null;
  /** Частка `saved`, що прийшла з привʼязаної банки (в грн). */
  fromJar?: number;
  /** Частка `saved`, що прийшла з ручних поповнень (в грн). */
  fromContributions?: number;
  contributions?: readonly GoalContributionLike[];
  linkedJarId?: string | undefined;
  linkedJarLabel?: string | undefined;
  /** Список банок для дропдауна привʼязки в режимі редагування. */
  jars?: readonly JarOption[];
  isEditing: boolean;
  onBeginEdit: () => void;
  onChangeName?: (next: string) => void;
  onChangeTarget?: (next: number) => void;
  onChangeDate?: (next: string) => void;
  onChangeLinkedJar?: (jarId: string) => void;
  onAddContribution?: (amountUah: number, note?: string) => void;
  onDeleteContribution?: (id: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

// Картка бюджету-цілі. Прогрес більше не редагується напряму — рахується
// з привʼязаної банки Monobank + логу ручних поповнень
// (goal-progress-auto-sync). Детерміновані пропси, memo дозволяє не
// перераховувати розмітку при перерендерах сторінки Budgets.
function GoalBudgetCardComponent({
  budget,
  showBalance = true,
  saved,
  pct,
  daysLeft,
  monthlyLabel,
  fromJar = 0,
  fromContributions = 0,
  contributions = [],
  linkedJarId,
  linkedJarLabel,
  jars = [],
  isEditing,
  onBeginEdit,
  onChangeName,
  onChangeTarget,
  onChangeDate,
  onChangeLinkedJar,
  onAddContribution,
  onDeleteContribution,
  onSave,
  onDelete,
}: GoalBudgetCardProps) {
  // W3 — fire goal-completed celebration exactly once per goal id. Persist
  // the dedup state because navigating away remounts the card and resets refs.
  const { goalCompleted, CelebrationComponent } = useCelebration();
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const targetId = `${fieldId}-target`;
  const jarId = `${fieldId}-jar`;
  const dateId = `${fieldId}-date`;
  const contribAmountId = `${fieldId}-contrib-amount`;
  const contribNoteId = `${fieldId}-contrib-note`;

  const [addingContribution, setAddingContribution] = useState(false);
  const [contribAmount, setContribAmount] = useState("");
  const [contribNote, setContribNote] = useState("");
  // Список поповнень згорнутий за замовчуванням (design decision #2).
  const [historyOpen, setHistoryOpen] = useState(false);

  // Сума цілі редагується в ЛОКАЛЬНІЙ чернетці й потрапляє в стан бюджетів
  // (а отже і на синхронізацію) лише на «Зберегти». Раніше `onChangeTarget`
  // летів на кожен символ: після першої цифри «4» з «40 00» pct рахувався
  // від недописаної суми, спрацьовувало святкування й забирало фокус.
  // Чернетка ініціалізується при вході в редагування (патерн «стан із
  // пропів під час рендера», без ефекту й зайвого кадру зі старою сумою).
  const [draftTarget, setDraftTarget] = useState<number | null>(
    budget.targetAmount > 0 ? budget.targetAmount : null,
  );
  const [wasEditing, setWasEditing] = useState(isEditing);
  if (wasEditing !== isEditing) {
    setWasEditing(isEditing);
    if (isEditing) {
      setDraftTarget(budget.targetAmount > 0 ? budget.targetAmount : null);
    }
  }
  const draftTargetValid =
    draftTarget !== null && Number.isFinite(draftTarget) && draftTarget > 0;

  const handleSave = () => {
    if (!draftTargetValid) return;
    onChangeTarget?.(draftTarget);
    onSave();
  };

  useEffect(() => {
    // Святкуємо лише від ЗБЕРЕЖЕНОГО стану: у режимі редагування картка
    // показує чернетку, а не ціль, тож «досягнення» тут було б хибним, а
    // дедуп-ключ спалився б назавжди.
    if (isEditing) return;
    if (pct < 100) return;
    const celebrationId = `finyk:goal-completed:${budget.id}`;
    if (isNudgeDismissed(webKVStore, celebrationId)) return;
    dismissNudge(webKVStore, celebrationId);
    goalCompleted(budget.name ?? "Ціль закрито", saved, "₴", "finyk");
  }, [isEditing, pct, budget.id, budget.name, saved, goalCompleted]);

  const contribAmountNum = Number(contribAmount);
  const contribAmountValid =
    contribAmount.trim() !== "" &&
    Number.isFinite(contribAmountNum) &&
    contribAmountNum > 0;

  const handleAddContribution = () => {
    if (!contribAmountValid) return;
    onAddContribution?.(contribAmountNum, contribNote.trim() || undefined);
    setContribAmount("");
    setContribNote("");
    setAddingContribution(false);
    setHistoryOpen(true);
  };

  // Показуємо розбивку лише коли обидва джерела дійсно внесли щось —
  // якщо ціль лише з банки або лише з поповнень, сума вже й так очевидна.
  const hasBreakdown = fromJar > 0 && fromContributions > 0;

  return (
    <>
      {CelebrationComponent}
      <Card
        prominence="ghost"
        padding="md"
        className="border-b border-line rounded-none"
      >
        {isEditing ? (
          <div className="space-y-2">
            <div>
              <Label htmlFor={nameId}>Назва цілі</Label>
              <Input
                id={nameId}
                size="sm"
                placeholder="Назва"
                value={budget.name || ""}
                onChange={(e) => onChangeName?.(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={targetId}>Сума цілі</Label>
              <MoneyInput
                id={targetId}
                size="sm"
                placeholder="Сума"
                value={draftTarget ?? ""}
                onValueChange={setDraftTarget}
              />
            </div>
            {jars.length > 0 && (
              <div>
                <Label htmlFor={jarId}>Банка Monobank</Label>
                <JarSelector
                  value={linkedJarId}
                  onChange={(id) => onChangeLinkedJar?.(id)}
                  jars={jars}
                />
              </div>
            )}
            <DateField
              id={dateId}
              size="sm"
              label="Дата завершення"
              emptyLabel="Дата"
              value={budget.targetDate || ""}
              onChange={(e) => onChangeDate?.(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                size="sm"
                onClick={handleSave}
                disabled={!draftTargetValid}
                tone="ink"
                variant="solid"
              >
                Зберегти
              </Button>
              <Button
                className="flex-1"
                size="sm"
                variant="soft"
                tone="danger"
                onClick={onDelete}
              >
                Видалити
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-2">
              <span className="text-style-body font-semibold">
                {budget.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-style-caption text-muted">
                  {showBalance ? (
                    <>
                      <Money amount={saved} /> /{" "}
                      <Money amount={budget.targetAmount} />
                    </>
                  ) : (
                    "••••"
                  )}
                </span>
                <button
                  type="button"
                  onClick={onBeginEdit}
                  className="text-subtle hover:text-text transition-colors"
                  aria-label="Редагувати ціль"
                >
                  <Icon name="edit" size="md" aria-hidden />
                </button>
              </div>
            </div>
            <div className="h-2 bg-bg rounded-[3px] overflow-hidden">
              <div
                className="h-full rounded-[3px] bg-success transition-[width,background-color] duration-slower"
                style={{ width: `${pct}%` }}
              />
            </div>
            {monthlyLabel && (
              <div className="text-style-caption text-subtle mt-1.5">
                {monthlyLabel}
              </div>
            )}
            <div className="text-style-caption text-subtle mt-0.5">
              {pct}% ·{" "}
              {daysLeft !== null
                ? daysLeft > 0
                  ? `${daysLeft} ${pluralDays(daysLeft)} до мети`
                  : "Термін минув"
                : "Без дедлайну"}
            </div>
            {hasBreakdown && (
              <div className="text-style-caption text-subtle mt-0.5">
                {showBalance ? (
                  <>
                    з банки{linkedJarLabel ? ` «${linkedJarLabel}»` : ""}{" "}
                    <Money amount={fromJar} /> · вручну{" "}
                    <Money amount={fromContributions} />
                  </>
                ) : (
                  "••••"
                )}
              </div>
            )}
            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddingContribution((v) => !v)}
              >
                + Поповнити
              </Button>
              {contributions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  aria-expanded={historyOpen}
                  className="text-style-caption text-subtle hover:text-text flex items-center gap-1 transition-colors"
                >
                  Історія ({contributions.length})
                </button>
              )}
            </div>
            {addingContribution && (
              <div className="mt-2 space-y-2 p-3 rounded-xl bg-bg border border-line">
                <div>
                  <Label htmlFor={contribAmountId}>Сума поповнення</Label>
                  <MoneyInput
                    id={contribAmountId}
                    size="sm"
                    placeholder="Сума"
                    value={contribAmount}
                    onValueChange={(next) =>
                      setContribAmount(next == null ? "" : String(next))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor={contribNoteId}>Нотатка (необовʼязково)</Label>
                  <Input
                    id={contribNoteId}
                    size="sm"
                    placeholder="Нотатка"
                    value={contribNote}
                    onChange={(e) => setContribNote(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    size="sm"
                    onClick={handleAddContribution}
                    disabled={!contribAmountValid}
                    tone="ink"
                    variant="solid"
                  >
                    Додати
                  </Button>
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="outline"
                    onClick={() => setAddingContribution(false)}
                  >
                    Скасувати
                  </Button>
                </div>
              </div>
            )}
            {historyOpen && contributions.length > 0 && (
              <ul className="mt-2 space-y-1">
                {[...contributions].reverse().map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 text-style-caption text-subtle"
                  >
                    <span>
                      {c.date}
                      {c.note ? ` · ${c.note}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      {showBalance ? <Money amount={c.amountUah} /> : "••••"}
                      <button
                        type="button"
                        onClick={() => onDeleteContribution?.(c.id)}
                        aria-label={`Видалити поповнення ${formatMoney(c.amountUah)} від ${c.date}`}
                        className="text-subtle hover:text-danger-strong dark:hover:text-danger transition-colors"
                      >
                        <Icon name="trash" size="sm" aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </>
  );
}

export const GoalBudgetCard = memo(GoalBudgetCardComponent);
