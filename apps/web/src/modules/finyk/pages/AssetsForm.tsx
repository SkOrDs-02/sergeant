import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { parseExpenseSpeech as parseExpenseVoice } from "@sergeant/shared";
import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import type {
  Debt,
  Receivable,
} from "@sergeant/finyk-domain/domain/debtEngine";
import type { ManualAsset, Subscription } from "../hooks/useStorage";

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
        placeholder="Назва"
        value={newSub.name}
        onChange={(e) => setNewSub((a) => ({ ...a, name: e.target.value }))}
      />
      <Input
        placeholder="Ключове слово з транзакції"
        value={newSub.keyword}
        onChange={(e) => setNewSub((a) => ({ ...a, keyword: e.target.value }))}
      />
      <Input
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
      <div className="flex gap-2">
        <Button
          className="flex-1"
          size="sm"
          onClick={() => {
            if (newSub.name && newSub.billingDay) {
              setSubscriptions((ss) => [
                ...ss,
                {
                  ...newSub,
                  id: Date.now().toString(),
                  billingDay: Number(newSub.billingDay) || 0,
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
            }
          }}
        >
          Додати
        </Button>
        <Button
          className="flex-1"
          size="sm"
          variant="ghost"
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
}) {
  return (
    <Card variant="flat" radius="md" className="space-y-3">
      <Input
        placeholder="Ім'я або назва"
        value={newRecv.name}
        onChange={(e) => setNewRecv((a) => ({ ...a, name: e.target.value }))}
      />
      <Input
        placeholder="Сума ₴"
        type="number"
        value={newRecv.amount}
        onChange={(e) => setNewRecv((a) => ({ ...a, amount: e.target.value }))}
      />
      <Input
        placeholder="Нотатка (необов'язково)"
        value={newRecv.note}
        onChange={(e) => setNewRecv((a) => ({ ...a, note: e.target.value }))}
      />
      <Input
        type="date"
        value={newRecv.dueDate}
        onChange={(e) => setNewRecv((a) => ({ ...a, dueDate: e.target.value }))}
      />
      <div className="flex gap-2">
        <Button
          className="flex-1"
          size="sm"
          onClick={() => {
            if (newRecv.name && newRecv.amount) {
              setReceivables((rs) => [
                ...rs,
                {
                  ...newRecv,
                  id: Date.now().toString(),
                  amount: Number(newRecv.amount),
                  linkedTxIds: [],
                } as Receivable,
              ]);
              setNewRecv({
                name: "",
                emoji: "\u{1F464}",
                amount: "",
                note: "",
                dueDate: "",
              });
              setShowRecvForm(false);
            }
          }}
        >
          Додати
        </Button>
        <Button
          className="flex-1"
          size="sm"
          variant="ghost"
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
}: {
  newAsset: { name: string; amount: string; currency: string; emoji: string };
  setNewAsset: React.Dispatch<React.SetStateAction<typeof newAsset>>;
  setManualAssets: React.Dispatch<React.SetStateAction<ManualAsset[]>>;
  setShowAssetForm: (v: boolean) => void;
  assetFormRef: React.RefObject<HTMLElement | null>;
  assetNameInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <Card
      ref={assetFormRef as React.Ref<HTMLElement>}
      variant="finyk-soft"
      radius="md"
      className="space-y-3"
    >
      <div>
        <div className="text-sm font-bold text-text">Новий актив</div>
        <div className="text-xs text-muted mt-0.5">
          Готівка, брокерський рахунок, крипта тощо.
        </div>
      </div>
      <Input
        ref={assetNameInputRef as React.Ref<HTMLInputElement>}
        placeholder="Назва"
        value={newAsset.name}
        onChange={(e) => setNewAsset((a) => ({ ...a, name: e.target.value }))}
      />
      <Input
        placeholder="Сума"
        type="number"
        value={newAsset.amount}
        onChange={(e) => setNewAsset((a) => ({ ...a, amount: e.target.value }))}
      />
      <select
        className="input-focus-finyk w-full h-11 rounded-2xl border border-line bg-panelHi px-4 text-text"
        value={newAsset.currency}
        onChange={(e) =>
          setNewAsset((a) => ({ ...a, currency: e.target.value }))
        }
      >
        <option>UAH</option>
        <option>USD</option>
        <option>EUR</option>
        <option>BTC</option>
      </select>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          size="sm"
          onClick={() => {
            if (newAsset.name && newAsset.amount) {
              setManualAssets((a) => [
                ...a,
                {
                  ...newAsset,
                  id: Date.now().toString(),
                  amount: Number(newAsset.amount),
                } as ManualAsset,
              ]);
              setNewAsset({
                name: "",
                amount: "",
                currency: "UAH",
                emoji: "\u{1F4B0}",
              });
              setShowAssetForm(false);
            }
          }}
        >
          Додати
        </Button>
        <Button
          className="flex-1"
          size="sm"
          variant="ghost"
          onClick={() => setShowAssetForm(false)}
        >
          Скасувати
        </Button>
      </div>
    </Card>
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
}) {
  return (
    <Card
      ref={debtFormRef as React.Ref<HTMLElement>}
      variant="finyk-soft"
      radius="md"
      className="space-y-3 mb-2"
    >
      <div>
        <div className="text-sm font-bold text-text">Новий пасив</div>
        <div className="text-xs text-muted mt-0.5">
          Кредит, борг або інше зобов&#x27;язання.
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          ref={debtNameInputRef as React.Ref<HTMLInputElement>}
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
        placeholder="Загальна сума ₴"
        type="number"
        value={newDebt.totalAmount}
        onChange={(e) =>
          setNewDebt((a) => ({ ...a, totalAmount: e.target.value }))
        }
      />
      <Input
        type="date"
        value={newDebt.dueDate}
        onChange={(e) => setNewDebt((a) => ({ ...a, dueDate: e.target.value }))}
      />
      <div className="flex gap-2">
        <Button
          className="flex-1"
          size="sm"
          onClick={() => {
            if (newDebt.name && newDebt.totalAmount) {
              setManualDebts((ds) => [
                ...ds,
                {
                  ...newDebt,
                  id: Date.now().toString(),
                  totalAmount: Number(newDebt.totalAmount),
                  linkedTxIds: [],
                } as Debt,
              ]);
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
          Додати
        </Button>
        <Button
          className="flex-1"
          size="sm"
          variant="ghost"
          onClick={() => setShowDebtForm(false)}
        >
          Скасувати
        </Button>
      </div>
    </Card>
  );
}
