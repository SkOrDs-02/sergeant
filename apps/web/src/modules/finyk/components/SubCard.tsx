import { memo, useState } from "react";
import { daysUntil, fmtDate } from "../utils";
import { cn } from "@shared/lib/cn";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { Select } from "@shared/components/ui/Select";
import {
  getLastTxForSubscription,
  getSubscriptionAmountMeta,
} from "@sergeant/finyk-domain/domain/subscriptionUtils";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

interface SubscriptionInput {
  id: string;
  name: string;
  emoji?: string;
  keyword?: string;
  billingDay?: number | string;
  currency?: string;
  linkedTxId?: string;
  [extra: string]: unknown;
}

interface SubCardProps {
  sub: SubscriptionInput;
  transactions: readonly Transaction[];
  onDelete: () => void;
  onEdit?: (patch: {
    name: string;
    emoji?: string;
    keyword: string;
    billingDay: number;
    currency: string;
  }) => void;
  onLinkTransactions?: () => void;
  showBalance?: boolean;
}

const EMOJI_OPTIONS = [
  "📱",
  "🎵",
  "☁️",
  "▶️",
  "🎬",
  "📧",
  "📸",
  "🤖",
  "🎮",
  "📚",
  "🏋️",
  "💊",
  "🔒",
  "🌐",
  "📡",
];

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
    onEdit?.({
      name: form.name,
      emoji: form.emoji,
      keyword: form.keyword,
      billingDay: Number(form.billingDay),
      currency: form.currency,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <Card variant="finyk-soft" padding="md" className="mb-3 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setForm((f) => ({ ...f, emoji: e }))}
              aria-label={`Вибрати ${e}`}
              aria-pressed={form.emoji === e}
              className={cn(
                "text-xl w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                form.emoji === e
                  ? "bg-finyk-soft ring-1 ring-finyk-ring/50"
                  : "hover:bg-panelHi",
              )}
            >
              {e}
            </button>
          ))}
        </div>
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
        <div className="flex gap-2">
          <Button
            variant="finyk-soft"
            size="md"
            className="flex-1"
            onClick={saveEdit}
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

  return (
    <Card
      variant="default"
      padding="md"
      className={cn(
        "mb-3 flex items-center gap-3",
        veryClose ? "border-danger/50" : soon ? "border-amber-500/40" : null,
      )}
    >
      <span className="text-2xl shrink-0 leading-none">{sub.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-style-label truncate">{sub.name}</div>
        <div
          className={cn(
            "text-xs mt-0.5",
            veryClose ? "text-danger" : soon ? "text-amber-400" : "text-subtle",
          )}
        >
          {veryClose
            ? "⚠️ Завтра"
            : soon
              ? `⏰ Через ${days} дні`
              : `📅 Через ${days} днів`}{" "}
          · {sub.billingDay}-го
        </div>
        {sub.linkedTxId && lastTx && (
          <div className="text-xs text-finyk mt-0.5">
            Привʼязано до транзакції · оновлює суму та дату
          </div>
        )}
        {lastTx && lastTx.time != null && (
          <div className="text-xs text-subtle mt-0.5">
            Останнє: {fmtDate(lastTx.time)}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {amount != null ? (
          <div className="text-sm font-bold">
            {showBalance
              ? `${amount.toLocaleString("uk-UA", { maximumFractionDigits: 2 })}${currency}`
              : "••••"}
          </div>
        ) : (
          <div className="text-xs text-subtle">ще не списувалось</div>
        )}
        <div className="flex flex-wrap justify-end gap-1.5 mt-1">
          {onLinkTransactions && (
            <Button
              variant="ghost"
              size="xs"
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
              ✏️
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
            🗑
          </Button>
        </div>
      </div>
    </Card>
  );
}

export const SubCard = memo(SubCardComponent);
