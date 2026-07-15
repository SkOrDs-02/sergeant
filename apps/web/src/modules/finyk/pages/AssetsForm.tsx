import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { parseExpenseSpeech as parseExpenseVoice } from "@sergeant/shared";
import { useLocale } from "@shared/i18n/useLocale";
import { PaywallModal, useFeatureGate } from "../../../core/billing";
import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import type {
  Debt,
  Receivable,
} from "@sergeant/finyk-domain/domain/debtEngine";
import type { ManualAsset, Subscription } from "../hooks/useStorage";

const isPositiveFinite = (value: string) => {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
};

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
}) {
  return (
    <Card variant="flat" radius="md" className="space-y-3 mt-2">
      <Input
        aria-label="Назва підписки"
        placeholder="Назва"
        value={newSub.name}
        onChange={(e) => setNewSub((a) => ({ ...a, name: e.target.value }))}
      />
      <Input
        aria-label="Ключове слово з транзакції"
        placeholder="Ключове слово з транзакції"
        value={newSub.keyword}
        onChange={(e) => setNewSub((a) => ({ ...a, keyword: e.target.value }))}
      />
      <p className="text-xs text-subtle">
        Якщо не привʼязувати вручну, для суми підписки знайдемо найновішу
        витратну транзакцію, опис якої містить це слово.
      </p>
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
        aria-label="Ім'я або назва боржника"
        placeholder="Ім'я або назва"
        value={newRecv.name}
        onChange={(e) => setNewRecv((a) => ({ ...a, name: e.target.value }))}
      />
      <Input
        aria-label="Сума у гривнях"
        placeholder="Сума ₴"
        type="number"
        value={newRecv.amount}
        onChange={(e) => setNewRecv((a) => ({ ...a, amount: e.target.value }))}
      />
      <Input
        aria-label="Нотатка (необов'язково)"
        placeholder="Нотатка (необов'язково)"
        value={newRecv.note}
        onChange={(e) => setNewRecv((a) => ({ ...a, note: e.target.value }))}
      />
      <div className="space-y-1.5">
        <Label htmlFor="receivable-due-date" optional>
          Дата повернення
        </Label>
        <Input
          id="receivable-due-date"
          aria-label="Дата повернення"
          className="w-full"
          type="date"
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
            const parsedAmount = Number(newRecv.amount);
            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
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
  // Phase 7 D2 — multi-currency assets (non-UAH) are gated to Premium.
  // UAH stays free for everyone; touching the picker to switch off UAH
  // opens the paywall and reverts the selection. `useLocale` resolves
  // paywall copy under `?lang=en` override; UA users see UK copy via
  // the resolver's fall-through.
  const currencyGate = useFeatureGate("multi-currency");
  const { messages } = useLocale();
  const onCurrencyChange = (next: string) => {
    if (next !== "UAH" && !currencyGate.requireAccess()) return;
    setNewAsset((a) => ({ ...a, currency: next }));
  };
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
          <div className="text-xs text-muted mt-0.5">
            Готівка, брокерський рахунок, крипта тощо.
          </div>
        </div>
        <Input
          ref={assetNameInputRef as React.Ref<HTMLInputElement>}
          aria-label="Назва активу"
          placeholder="Назва"
          value={newAsset.name}
          onChange={(e) => setNewAsset((a) => ({ ...a, name: e.target.value }))}
        />
        <Input
          aria-label="Сума активу"
          placeholder="Сума"
          type="number"
          value={newAsset.amount}
          onChange={(e) =>
            setNewAsset((a) => ({ ...a, amount: e.target.value }))
          }
        />
        <select
          aria-label="Валюта активу"
          className="input-focus-finyk w-full h-11 rounded-2xl border border-line bg-panelHi px-4 text-text"
          value={newAsset.currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
        >
          <option value="UAH">UAH</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="BTC">BTC</option>
        </select>
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
              // unconditionally prepends `+`), and pulls Загальний нетворс
              // negative.
              const parsedAmount = Number(newAsset.amount);
              if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
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
      <PaywallModal
        open={currencyGate.paywallOpen}
        onClose={currencyGate.closePaywall}
        surface={currencyGate.paywallSurface}
        title={messages.paywall["multi-currency"].title}
        description={messages.paywall["multi-currency"].description}
      />
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
        <div className="text-xs text-muted mt-0.5">
          Кредит, борг або інше зобов&#x27;язання.
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          ref={debtNameInputRef as React.Ref<HTMLInputElement>}
          aria-label="Назва пасиву (кредит, борг…)"
          className="flex-1"
          placeholder="Назва пасиву (кредит, борг…)"
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
      <Input
        aria-label="Загальна сума у гривнях"
        placeholder="Загальна сума ₴"
        type="number"
        value={newDebt.totalAmount}
        onChange={(e) =>
          setNewDebt((a) => ({ ...a, totalAmount: e.target.value }))
        }
      />
      <div className="space-y-1.5">
        <Label htmlFor="debt-due-date" optional>
          Дата погашення
        </Label>
        <Input
          id="debt-due-date"
          aria-label="Дата погашення"
          className="w-full"
          type="date"
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
                amount: Number(newDebt.totalAmount),
                totalAmount: Number(newDebt.totalAmount),
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
