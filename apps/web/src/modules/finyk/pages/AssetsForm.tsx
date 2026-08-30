import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { MoneyInput } from "@shared/components/ui/MoneyInput";
import { DateField } from "@shared/components/ui/DateField";
import { Label } from "@shared/components/ui/FormField";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import {
  formatNumberUk,
  parseExpenseSpeech as parseExpenseVoice,
} from "@sergeant/shared";
import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import type {
  Debt,
  Receivable,
} from "@sergeant/finyk-domain/domain/debtEngine";
import type { ManualAsset, Subscription } from "../hooks/useStorage";
import { getLastTxForSubscription } from "@sergeant/finyk-domain/domain/subscriptionUtils";
import type { TxRowTx } from "../components/TxRow";
import { parseAmountToMinor } from "@shared/lib/format/amount";
import { amountStringToHryvnia } from "@shared/lib/format/amountSchema";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";

// Спільні межі сум (спека beta-input-boundaries): додає верхню стелю й
// відсікання «1e9» до наявної вимоги «строго додатне».
const isPositiveFinite = (value: string) => parseAmountToMinor(value).ok;

const isValidBillingDay = (value: string | number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31;
};

// ---------------------------------------------------------------------------
// Subscription form
// ---------------------------------------------------------------------------
export function SubscriptionForm({
  newSub,
  setNewSub,
  setSubscriptions,
  setShowSubForm,
  transactions = [],
}: {
  newSub: {
    name: string;
    emoji: string;
    keyword: string;
    billingDay: string | number;
    currency: string;
  };
  setNewSub: React.Dispatch<React.SetStateAction<typeof newSub>>;
  setSubscriptions: React.Dispatch<React.SetStateAction<Subscription[]>>;
  setShowSubForm: (v: boolean) => void;
  transactions?: readonly TxRowTx[];
}) {
  const keywordMatch = newSub.keyword.trim()
    ? getLastTxForSubscription({ keyword: newSub.keyword }, [...transactions])
    : null;
  return (
    <Card variant="flat" radius="md" className="space-y-3 mt-2">
      <Input
        aria-label="Назва підписки"
        placeholder="Назва"
        maxLength={NAME_MAX_LEN}
        showCharCount={false}
        value={newSub.name}
        onChange={(e) => setNewSub((a) => ({ ...a, name: e.target.value }))}
      />
      <div className="space-y-1.5">
        <Label htmlFor="subscription-transaction-keyword" optional>
          Пошук транзакції за описом
        </Label>
        <Input
          id="subscription-transaction-keyword"
          aria-label="Пошук транзакції за описом"
          // Поле стоїть посеред форми з іншими текстовими інпутами, тож без
          // явних `name`/`autocomplete` менеджер паролів має всі підстави
          // прийняти його за логін (див. `searchFieldProps.ts`). Побічно
          // знімає й автокапіталізацію — «netflix» не має ставати «Netflix».
          {...searchFieldProps("subscription-keyword-search")}
          placeholder="Наприклад, netflix"
          maxLength={NAME_MAX_LEN}
          showCharCount={false}
          value={newSub.keyword}
          onChange={(e) =>
            setNewSub((a) => ({ ...a, keyword: e.target.value }))
          }
        />
      </div>
      <p className="text-style-caption text-subtle">
        Якщо не вибрати транзакцію вручну, знайдемо найновішу витрату, опис якої
        містить цей текст. Пошук не залежить від регістру.
      </p>
      {newSub.keyword.trim() && (
        <p className="text-style-caption text-subtle" role="status">
          {keywordMatch
            ? `Знайдено: ${keywordMatch.description || "Транзакція"} · ${formatNumberUk(Math.abs(keywordMatch.amount / 100))} ₴`
            : "Збігів не знайдено"}
        </p>
      )}
      <Input
        aria-label="День списання (1-31)"
        placeholder="День списання (1-31)"
        type="number"
        min="1"
        max="31"
        value={newSub.billingDay}
        onChange={(e) =>
          setNewSub((a) => ({
            ...a,
            billingDay: Number(e.target.value),
          }))
        }
      />
      {(!newSub.name.trim() || !isValidBillingDay(newSub.billingDay)) && (
        <p className="text-style-caption text-subtle" role="status">
          Заповни назву та вкажи день списання від 1 до 31.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          size="sm"
          disabled={
            !newSub.name.trim() || !isValidBillingDay(newSub.billingDay)
          }
          onClick={() => {
            if (!newSub.name || !newSub.billingDay) return;
            // The day-of-month <input type="number"> exposes min/max only as
            // browser hints — keyboard/paste/programmatic entry bypasses them.
            // Clamp to the calendar range so we never persist 0/99/NaN and
            // render nonsense like "Через 18 днів · 0-го".
            const parsedDay = Math.trunc(Number(newSub.billingDay));
            if (
              !Number.isFinite(parsedDay) ||
              parsedDay < 1 ||
              parsedDay > 31
            ) {
              return;
            }
            setSubscriptions((ss) => [
              ...ss,
              {
                ...newSub,
                id: crypto.randomUUID(),
                billingDay: parsedDay,
              } as Subscription,
            ]);
            notifyFinykRoutineCalendarSync();
            setNewSub({
              name: "",
              emoji: "\u{1F4F1}",
              keyword: "",
              billingDay: "",
              currency: "UAH",
            });
            setShowSubForm(false);
          }}
        >
          Додати
        </Button>
        <Button
          className="flex-1"
          size="sm"
          variant="secondary"
          onClick={() => setShowSubForm(false)}
        >
          Скасувати
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Receivable form ("Мені винні")
// ---------------------------------------------------------------------------
export function ReceivableForm({
  newRecv,
  setNewRecv,
  setReceivables,
  setShowRecvForm,
  editingId,
  onUpdate,
}: {
  newRecv: {
    name: string;
    emoji: string;
    amount: string;
    note: string;
    dueDate: string;
  };
  setNewRecv: React.Dispatch<React.SetStateAction<typeof newRecv>>;
  setReceivables: React.Dispatch<React.SetStateAction<Receivable[]>>;
  setShowRecvForm: (v: boolean) => void;
  editingId?: string | null;
  onUpdate?: (id: string, value: Receivable) => void;
}) {
  return (
    <Card variant="flat" radius="md" className="space-y-3">
      <div className="text-style-label text-text">
        {editingId ? "Редагування запису" : "Новий запис «Мені винні»"}
      </div>
      <Input
        aria-label="Імʼя або назва боржника"
        placeholder="Імʼя або назва"
        maxLength={NAME_MAX_LEN}
        showCharCount={false}
        value={newRecv.name}
        onChange={(e) => setNewRecv((a) => ({ ...a, name: e.target.value }))}
      />
      <MoneyInput
        aria-label="Сума у гривнях"
        placeholder="Сума ₴"
        value={newRecv.amount}
        onValueChange={(next) =>
          setNewRecv((a) => ({
            ...a,
            amount: next == null ? "" : String(next),
          }))
        }
      />
      <Input
        aria-label="Нотатка (необовʼязково)"
        placeholder="Нотатка (необовʼязково)"
        maxLength={NAME_MAX_LEN}
        showCharCount={false}
        value={newRecv.note}
        onChange={(e) => setNewRecv((a) => ({ ...a, note: e.target.value }))}
      />
      <div className="space-y-1.5">
        <Label htmlFor="receivable-due-date" optional>
          Дата повернення
        </Label>
        <DateField
          id="receivable-due-date"
          aria-label="Дата повернення"
          className="w-full"
          emptyLabel="Обери дату повернення"
          value={newRecv.dueDate}
          onChange={(e) =>
            setNewRecv((a) => ({ ...a, dueDate: e.target.value }))
          }
        />
      </div>
      {(!newRecv.name.trim() || !isPositiveFinite(newRecv.amount)) && (
        <p className="text-style-caption text-subtle" role="status">
          Заповни імʼя та вкажи позитивну суму.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          size="sm"
          disabled={!newRecv.name.trim() || !isPositiveFinite(newRecv.amount)}
          onClick={() => {
            if (!newRecv.name || !newRecv.amount) return;
            // <input type="number"> accepts negatives + arbitrary precision;
            // a Receivable («мені винні») must be strictly positive — a
            // negative receivable corrupts net-worth aggregation and renders
            // as "−1 000 ₴" on a row that is supposed to be an asset.
            const parsedAmount = amountStringToHryvnia(String(newRecv.amount));
            if (parsedAmount <= 0) return;
            const next = {
              ...newRecv,
              id: crypto.randomUUID(),
              amount: parsedAmount,
              linkedTxIds: [],
            } as Receivable;
            if (editingId && onUpdate) {
              onUpdate(editingId, { ...next, id: editingId });
            } else {
              setReceivables((rs) => [...rs, next]);
            }
            setNewRecv({
              name: "",
              emoji: "\u{1F464}",
              amount: "",
              note: "",
              dueDate: "",
            });
            setShowRecvForm(false);
          }}
        >
          {editingId ? "Зберегти" : "Додати"}
        </Button>
        <Button
          className="flex-1"
          size="sm"
          variant="secondary"
          onClick={() => setShowRecvForm(false)}
        >
          Скасувати
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Manual asset form
// ---------------------------------------------------------------------------
export function AssetForm({
  newAsset,
  setNewAsset,
  setManualAssets,
  setShowAssetForm,
  assetFormRef,
  assetNameInputRef,
  editingId,
  onUpdate,
}: {
  newAsset: { name: string; amount: string; currency: string; emoji: string };
  setNewAsset: React.Dispatch<React.SetStateAction<typeof newAsset>>;
  setManualAssets: React.Dispatch<React.SetStateAction<ManualAsset[]>>;
  setShowAssetForm: (v: boolean) => void;
  assetFormRef: React.RefObject<HTMLElement | null>;
  assetNameInputRef: React.RefObject<HTMLInputElement | null>;
  editingId?: string | null;
  onUpdate?: (id: string, value: ManualAsset) => void;
}) {
  const isLegacyNonUah = newAsset.currency !== "UAH";
  return (
    <>
      <Card
        ref={assetFormRef as React.Ref<HTMLElement>}
        variant="finyk-soft"
        radius="md"
        className="space-y-3"
      >
        <div>
          <div className="text-style-label text-text">
            {editingId ? "Редагування активу" : "Новий актив"}
          </div>
          <div className="text-style-caption text-muted mt-0.5">
            Готівка, брокерський рахунок, крипта тощо.
          </div>
        </div>
        <Input
          ref={assetNameInputRef as React.Ref<HTMLInputElement>}
          aria-label="Назва активу"
          placeholder="Назва"
          maxLength={NAME_MAX_LEN}
          showCharCount={false}
          value={newAsset.name}
          onChange={(e) => setNewAsset((a) => ({ ...a, name: e.target.value }))}
        />
        <MoneyInput
          aria-label="Сума активу"
          placeholder="Сума"
          value={newAsset.amount}
          onValueChange={(next) =>
            setNewAsset((a) => ({
              ...a,
              amount: next == null ? "" : String(next),
            }))
          }
        />
        <div className="rounded-2xl border border-line bg-panelHi px-4 py-3">
          <div className="text-style-caption text-muted">Валюта активу</div>
          <div className="text-style-label text-text">
            {isLegacyNonUah ? newAsset.currency : "UAH"}
          </div>
        </div>
        {isLegacyNonUah && (
          <p
            className="text-style-caption text-warning-strong dark:text-warning"
            role="status"
          >
            Це старий запис у {newAsset.currency}. Валюту не змінюю без
            реального курсу, а суму поки не враховую в загальному капіталі.
          </p>
        )}
        {(!newAsset.name.trim() || !isPositiveFinite(newAsset.amount)) && (
          <p className="text-style-caption text-subtle" role="status">
            Заповни назву та вкажи позитивну суму активу.
          </p>
        )}
        <div className="flex gap-2">
          <Button
            className="flex-1"
            size="sm"
            disabled={
              !newAsset.name.trim() || !isPositiveFinite(newAsset.amount)
            }
            onClick={() => {
              if (!newAsset.name || !newAsset.amount) return;
              // <input type="number"> accepts negatives + arbitrary precision;
              // an asset balance must be strictly positive. A negative manual
              // asset shows up as "−1 000 ₴" inside the assets list, flips the
              // section header to "Активи +−1 000 ₴" (because the formatter
              // unconditionally prepends `+`), and pulls Загальний капітал
              // negative.
              const parsedAmount = amountStringToHryvnia(
                String(newAsset.amount),
              );
              if (parsedAmount <= 0) return;
              const next = {
                ...newAsset,
                id: crypto.randomUUID(),
                amount: parsedAmount,
              } as ManualAsset;
              if (editingId && onUpdate) {
                onUpdate(editingId, { ...next, id: editingId });
              } else {
                setManualAssets((a) => [...a, next]);
              }
              setNewAsset({
                name: "",
                amount: "",
                currency: "UAH",
                emoji: "\u{1F4B0}",
              });
              setShowAssetForm(false);
            }}
          >
            {editingId ? "Зберегти" : "Додати"}
          </Button>
          <Button
            className="flex-1"
            size="sm"
            variant="secondary"
            onClick={() => setShowAssetForm(false)}
          >
            Скасувати
          </Button>
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Manual debt form (with voice input)
// ---------------------------------------------------------------------------
export function DebtForm({
  newDebt,
  setNewDebt,
  setManualDebts,
  setShowDebtForm,
  debtFormRef,
  debtNameInputRef,
  editingId,
  onUpdate,
}: {
  newDebt: {
    name: string;
    emoji: string;
    totalAmount: string;
    dueDate: string;
  };
  setNewDebt: React.Dispatch<React.SetStateAction<typeof newDebt>>;
  setManualDebts: React.Dispatch<React.SetStateAction<Debt[]>>;
  setShowDebtForm: (v: boolean) => void;
  debtFormRef: React.RefObject<HTMLElement | null>;
  debtNameInputRef: React.RefObject<HTMLInputElement | null>;
  editingId?: string | null;
  onUpdate?: (id: string, value: Debt) => void;
}) {
  return (
    <Card
      ref={debtFormRef as React.Ref<HTMLElement>}
      variant="flat"
      radius="md"
      className="space-y-3 mb-2 border-danger/30 bg-danger-soft/40 dark:bg-danger/10"
    >
      <div>
        <div className="text-style-label text-danger-strong dark:text-danger">
          {editingId ? "Редагування пасиву" : "Новий пасив"}
        </div>
        <div className="text-style-caption text-muted mt-0.5">
          Кредит, борг або інше зобовʼязання.
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          ref={debtNameInputRef as React.Ref<HTMLInputElement>}
          aria-label="Назва пасиву (кредит, борг…)"
          className="flex-1"
          placeholder="Назва пасиву (кредит, борг…)"
          maxLength={NAME_MAX_LEN}
          showCharCount={false}
          value={newDebt.name}
          onChange={(e) => setNewDebt((a) => ({ ...a, name: e.target.value }))}
        />
        <VoiceMicButton
          size="md"
          label="Голосовий ввід"
          promptHint="Пасив у гривнях: кредит 50000, борг 12000, іпотека."
          onResult={(transcript) => {
            const parsed = parseExpenseVoice(transcript);
            if (!parsed) return;
            setNewDebt((a) => ({
              ...a,
              name: parsed.name || a.name,
              totalAmount:
                parsed.amount != null
                  ? String(Math.round(parsed.amount))
                  : a.totalAmount,
            }));
          }}
        />
      </div>
      <MoneyInput
        aria-label="Загальна сума у гривнях"
        placeholder="Загальна сума ₴"
        value={newDebt.totalAmount}
        onValueChange={(next) =>
          setNewDebt((a) => ({
            ...a,
            totalAmount: next == null ? "" : String(next),
          }))
        }
      />
      <div className="space-y-1.5">
        <Label htmlFor="debt-due-date" optional>
          Дата погашення
        </Label>
        <DateField
          id="debt-due-date"
          aria-label="Дата погашення"
          className="w-full"
          emptyLabel="Обери дату погашення"
          value={newDebt.dueDate}
          onChange={(e) =>
            setNewDebt((a) => ({ ...a, dueDate: e.target.value }))
          }
        />
      </div>
      {(!newDebt.name.trim() || !isPositiveFinite(newDebt.totalAmount)) && (
        <p className="text-style-caption text-subtle" role="status">
          Заповни назву та вкажи позитивну суму пасиву.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          size="sm"
          disabled={
            !newDebt.name.trim() || !isPositiveFinite(newDebt.totalAmount)
          }
          onClick={() => {
            if (newDebt.name && newDebt.totalAmount) {
              const next = {
                ...newDebt,
                id: crypto.randomUUID(),
                amount: amountStringToHryvnia(String(newDebt.totalAmount)),
                totalAmount: amountStringToHryvnia(String(newDebt.totalAmount)),
                linkedTxIds: [],
              } satisfies Debt;
              if (editingId && onUpdate) {
                onUpdate(editingId, { ...next, id: editingId });
              } else {
                setManualDebts((ds) => [...ds, next]);
              }
              setNewDebt({
                name: "",
                emoji: "\u{1F4B8}",
                totalAmount: "",
                dueDate: "",
              });
              setShowDebtForm(false);
            }
          }}
        >
          {editingId ? "Зберегти" : "Додати"}
        </Button>
        <Button
          className="flex-1"
          size="sm"
          variant="secondary"
          onClick={() => setShowDebtForm(false)}
        >
          Скасувати
        </Button>
      </div>
    </Card>
  );
}
