/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { memo, useState } from "react";
import { pluralDays } from "@sergeant/shared";
import { Money } from "@shared/components/ui/Money";
import { daysUntil, fmtDate } from "../utils";
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { Select } from "@shared/components/ui/Select";
import { Icon } from "@shared/components/ui/Icon";
import {
  getLastTxForSubscription,
  getSubscriptionAmountMeta,
} from "@sergeant/finyk-domain/domain/subscriptionUtils";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

interface SubscriptionInput {
  id: string;
  name: string;
  emoji?: string | undefined;
  keyword?: string | undefined;
  billingDay?: number | string | undefined;
  currency?: string | undefined;
  linkedTxId?: string | undefined;
  [extra: string]: unknown;
}

interface SubCardProps {
  sub: SubscriptionInput;
  transactions: readonly Transaction[];
  onDelete: () => void;
  onEdit?: (patch: {
    name: string;
    emoji?: string | undefined;
    keyword: string;
    billingDay: number;
    currency: string;
  }) => void;
  onLinkTransactions?: () => void;
  showBalance?: boolean;
}

// Картка підписки. Всередині тримає лише локальний стан редагування,
// тож memo уникає перерендеру при змінах інших підписок/сторінки.
function SubCardComponent({
  sub,
  transactions,
  onDelete,
  onEdit,
  onLinkTransactions,
  showBalance = true,
}: SubCardProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: sub.name,
    emoji: sub.emoji,
    keyword: sub.keyword || "",
    billingDay: sub.billingDay,
    currency: sub.currency || "UAH",
  });

  const lastTx = getLastTxForSubscription(sub, [...transactions]);
  const { amount, currency } = getSubscriptionAmountMeta(sub, [
    ...transactions,
  ]);
  const days = daysUntil(Number(sub.billingDay) || 1);
  const veryClose = days <= 1;
  const soon = days <= 3;

  const saveEdit = () => {
    if (!form.name || !form.billingDay) return;
    // Для вільного <input type="number"> min/max — лише підказки браузера:
    // клавіатура, вставка й програмний ввід можуть їх оминути. Приймаємо лише
    // цілі календарні дні, щоб `1.5` не перетворювалося непомітно на день 1.
    const parsedDay = Number(form.billingDay);
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      return;
    }
    onEdit?.({
      name: form.name,
      emoji: form.emoji,
      keyword: form.keyword,
      billingDay: parsedDay,
      currency: form.currency,
    });
    setEditing(false);
  };

  const parsedBillingDay = Number(form.billingDay);
  const editValid =
    form.name.trim().length > 0 &&
    Number.isInteger(parsedBillingDay) &&
    parsedBillingDay >= 1 &&
    parsedBillingDay <= 31;

  if (editing) {
    return (
      <Card variant="finyk-soft" padding="md" className="mb-3 space-y-3">
        <Input
          placeholder="Назва"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Input
          placeholder="Ключове слово з транзакції (якщо без ручної привʼязки)"
          value={form.keyword}
          onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
        />
        {/* AI-NOTE: caption навмисно — це підказка під полем «Ключове
            слово», а не текст для читання (density-hierarchy-spec §4). */}
        <p className="text-style-caption text-subtle">
          Якщо немає ручної привʼязки, для суми підписки знайдемо найновішу
          витратну транзакцію, опис якої містить це слово.
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="День (1-31)"
              type="number"
              min="1"
              max="31"
              value={form.billingDay}
              onChange={(e) =>
                setForm((f) => ({ ...f, billingDay: e.target.value }))
              }
            />
          </div>
          <div className="flex-1">
            <Select
              value={form.currency}
              aria-label="Валюта"
              onChange={(e) =>
                setForm((f) => ({ ...f, currency: e.target.value }))
              }
            >
              <option value="UAH">₴ UAH</option>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
            </Select>
          </div>
        </div>
        {!editValid ? (
          <p className="text-style-caption text-subtle" role="status">
            Заповни назву та вкажи день списання від 1 до 31.
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            variant="finyk-soft"
            size="md"
            className="flex-1"
            onClick={saveEdit}
            disabled={!editValid}
          >
            Зберегти
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={() => {
              setForm({
                name: sub.name,
                emoji: sub.emoji,
                keyword: sub.keyword || "",
                billingDay: sub.billingDay,
                currency: sub.currency || "UAH",
              });
              setEditing(false);
            }}
          >
            Скасувати
          </Button>
        </div>
      </Card>
    );
  }

  // Розкладка у два поверхи (звіт власника 2026-09-03: «шумно, обрізано»).
  // Раніше сума, кнопка «Змінити транзакцію» та дві іконки стояли в одній
  // правій колонці й забирали в назви половину ширини — назва рубалась
  // на другому слові, а дата переносилась на два рядки. Тепер права
  // колонка несе лише суму, а дії живуть окремим рядком під текстом.
  return (
    <Card
      variant="default"
      padding="md"
      className={cn(
        "mb-3",
        veryClose ? "border-danger/50" : soon ? "border-warning/40" : null,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          name="refresh-cw"
          size={20}
          className="mt-0.5 shrink-0 text-finyk"
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="text-style-label truncate">{sub.name}</div>
          <div
            className={cn(
              "text-style-caption mt-0.5",
              veryClose
                ? "text-danger-strong dark:text-danger"
                : soon
                  ? "text-warning-strong dark:text-warning"
                  : "text-subtle",
            )}
          >
            <Icon
              name={veryClose ? "alert-triangle" : soon ? "clock" : "calendar"}
              size={13}
              aria-hidden
            />{" "}
            {veryClose
              ? "Завтра"
              : soon
                ? `Через ${days} дні`
                : `Через ${days} ${pluralDays(days)}`}{" "}
            · {sub.billingDay}-го
          </div>
          {sub.linkedTxId && lastTx && (
            <div className="text-style-caption text-finyk mt-0.5">
              Привʼязано до транзакції · оновлює суму та дату
            </div>
          )}
          {lastTx && lastTx.time != null ? (
            <div className="text-style-caption text-subtle mt-0.5">
              Останнє: {fmtDate(lastTx.time)}
            </div>
          ) : (
            amount == null && (
              <div className="text-style-caption text-subtle mt-0.5">
                Ще не списувалось
              </div>
            )
          )}
        </div>
        {amount != null && (
          <div className="text-style-label tabular-nums shrink-0">
            {showBalance ? (
              // `maxFractionDigits` без `minFractionDigits` навмисно: як і
              // раніше, «500» лишається «500», а «500,5» — «500,5». Копійки
              // тут не факт, а залишок ділення, і дописувати «,00» до
              // кожної підписки означало б додати шум у кожен рядок.
              <Money amount={amount} symbol={currency} maxFractionDigits={2} />
            ) : (
              "••••"
            )}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1">
        {onLinkTransactions && (
          <Button
            variant="ghost"
            size="xs"
            // AI-DANGER: `text-xs` — розмір КОНТРОЛА, не роль тексту.
            // Це `Button` із власним `size="xs"`, якому тут збивають
            // геометрію (`h-auto`, свій падинг), щоб він сів у ряд дій.
            // Роль тексту описувала б інше.
            className="px-1.5 h-auto py-0.5 text-xs text-primary hover:bg-transparent hover:underline hover:text-primary"
            onClick={onLinkTransactions}
          >
            {sub.linkedTxId ? "Змінити транзакцію" : "Привʼязати транзакцію"}
          </Button>
        )}
        {onEdit && (
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            aria-label="Редагувати підписку"
            onClick={() => setEditing(true)}
            className="text-subtle hover:text-primary"
          >
            <Icon name="edit" size={16} aria-hidden />
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          aria-label="Видалити підписку"
          onClick={onDelete}
          className="text-subtle hover:text-danger"
        >
          <Icon name="trash" size={16} aria-hidden />
        </Button>
      </div>
    </Card>
  );
}

export const SubCard = memo(SubCardComponent);
