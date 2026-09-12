/**
 * Last validated: 2026-09-12
 * Status: Active
 *
 * Місток «транзакція з категорією Борг → пасив» (спека finyk-observations,
 * PR-3; узагальнено 2026-09-11 з income-only на обидва напрямки — рішення
 * власника, канон `docs/product/modules/finyk.md` § Журнал рішень).
 * Рендериться для НАДХОДЖЕННЯ з категорією `debt-income` (роль `source`)
 * і для ВИТРАТИ з категорією `debt` (роль `payment`) — у
 * {@link BankTransactionDetailsSheet} для банківської операції і в
 * {@link ManualExpenseSheet} для ручного запису.
 *
 * **Чому примітиви, а не `Transaction`.** Ручна витрата не є
 * транзакцією: вона живе в `finyk_manual_expenses` і має власну форму
 * (сума в гривнях, категорія-слаг). Секція ж використовує рівно три
 * поля — id, суму й дату, — тож бере їх окремими пропами. Той самий
 * прецедент, що й у `SilpoReceiptSection`, і рівно те, що дозволило
 * підключити її до другої поверхні без адаптера-перевертня.
 *
 * Роль визначає межу поведінки, не лише підпис:
 *  - `source`  — привʼязка підтверджує базу пасиву; дозволено створити
 *                НОВИЙ пасив просто з цієї операції (борг щойно виник).
 *  - `payment` — привʼязка зменшує залишок; створення нового пасиву
 *                НЕ пропонується (борг, що народжується вже сплаченим —
 *                нонсенс), лише вибір із наявних. Коли їх нема, показуємо
 *                чесну підказку, а не мертву кнопку.
 *
 * Обидві гілки пишуть через той самий `setLinkedTxRole`
 * (`@sergeant/finyk-domain/domain/debtEngine`) — це той самий контракт,
 * що тримає `AssetsDebtTxPicker`.
 *
 * **Сума й спліти (CodeRabbit finding #1, PR #1103).** Категорія
 * транзакції (яка гейтить рендер цієї секції) не знає про спліти —
 * `getExpenseCategoryForTransaction` читає лише override/MCC. Тож
 * транзакція може лишатись «Борг» навіть коли лише ЧАСТИНА її суми
 * розписана на категорію `debt` спліту. `splitAmountUAH` (рахує
 * `BankTransactionDetailsSheet` з `txSplits`) — сума саме цієї частини;
 * коли вона задана, `payment`-привʼязка бере її замість повної суми
 * транзакції, інакше погашення завищується і залишок пасиву падає
 * нижче, ніж людина реально сплатила.
 *
 * **Знімок звіряється заднім числом — рівень 3 (PR #1104).** Сума
 * пишеться в `txLinks` у момент привʼязки (див. докблок `LinkedTxMeta` у
 * `debtEngine.ts`), тож зміна спліту вже ПІСЛЯ привʼязки робила б її
 * застарілою. Це закриває `useDebtPaymentSplitSync`: обгортка над
 * `onSplitChange` перераховує суму й показує тост «було → стало», а коли
 * частки боргу не лишилось — питає, а не відвʼязує мовчки. Обгортка
 * стоїть на кожній поверхні, що роздає `onSplitChange` (`Transactions`
 * для банківських операцій, `FinykApp` для ручних записів), бо сам
 * мутатор сховища сирої суми транзакції не бачить.
 */
import { useState } from "react";
import type {
  Debt,
  LinkedTxRole,
  SetLinkedTxRole,
} from "@sergeant/finyk-domain/domain/debtEngine";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { Money } from "@shared/components/ui/Money";
import { Sheet } from "@shared/components/ui/Sheet";
import { messages } from "@shared/i18n/uk";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";

const shared = messages.finyk.debtLinkPrompt;
// Той самий підпис «авто», що й у пікері `AssetsDebtTxPicker` — одна мітка
// на дві поверхні (§ Level 2, вимога «нічого не пишеться мовчки»).
const autoLabel = messages.finyk.debtTxLink.autoLabel;

export interface DebtTxLinkSectionProps {
  /** Id операції або ручного запису — ключ у `linkedTxIds` / `txLinks`. */
  txId: string;
  /** Повна сума в КОПІЙКАХ; знак ігнорується. */
  txAmountKop: number;
  /**
   * Дата для картки створення нового пасиву (лише роль `source`).
   * Будь-який рядок, який приймає `new Date()`; викликач сам зводить
   * свою форму дати до одного значення.
   */
  txDateIso: string;
  manualDebts: readonly Debt[];
  setManualDebts: (updater: (debts: Debt[]) => Debt[]) => void;
  setLinkedTxRole: SetLinkedTxRole;
  /**
   * `source` — операція, якою борг виник (надходження на пасив).
   * `payment` — погашення (витрата по пасиву). Визначає і копію, і те,
   * чи пропонується створення нового пасиву.
   *
   * Названо `txRole`, не `role`: JSX-атрибут `role="…"` на власному
   * компоненті все одно ловиться `jsx-a11y/aria-role` (правило перевіряє
   * ім'я атрибута, не тип елемента), і `"source"`/`"payment"` — не валідні
   * ARIA-ролі.
   */
  txRole: LinkedTxRole;
  /**
   * Сума частини транзакції, розписаної на категорію `debt` у спліті
   * (§ докблок вище). `null`/`undefined` — транзакція не розділена
   * (або спліт не має `debt`-частки) → бере повну суму транзакції.
   */
  splitAmountUAH?: number | null | undefined;
}

export function DebtTxLinkSection({
  txId,
  txAmountKop,
  txDateIso,
  manualDebts,
  setManualDebts,
  setLinkedTxRole,
  txRole,
  splitAmountUAH,
}: DebtTxLinkSectionProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDebtName, setNewDebtName] = useState("");

  const isPayment = txRole === "payment";
  const copy = isPayment ? shared.payment : shared.source;

  const amountUAH =
    splitAmountUAH != null
      ? Math.abs(splitAmountUAH)
      : Math.abs(txAmountKop / 100);
  // Дата лише прикрашає картку створення пасиву, тож непарсабельне
  // значення має її прибрати, а не завалити секцію: `Intl.DateTimeFormat`
  // кидає `RangeError` на Invalid Date, і це поклало б увесь аркуш через
  // косметичний рядок.
  const parsedDate = new Date(txDateIso);
  const dateLabel = Number.isNaN(parsedDate.getTime())
    ? null
    : new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(
        parsedDate,
      );
  const linkedDebt = manualDebts.find((d) =>
    (d.linkedTxIds || []).includes(txId),
  );

  const linkExisting = (debtId: string) => {
    setLinkedTxRole(debtId, txId, "debt", txRole, amountUAH);
    setShowPicker(false);
  };

  const createDebt = () => {
    const name = newDebtName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    setManualDebts((debts) => [
      ...debts,
      {
        id,
        name,
        emoji: "\u{1F4B8}",
        amount: amountUAH,
        totalAmount: amountUAH,
        linkedTxIds: [txId],
        txLinks: { [txId]: { role: txRole, amount: amountUAH } },
      },
    ]);
    setNewDebtName("");
    setShowCreateForm(false);
  };

  if (linkedDebt) {
    const isAuto = linkedDebt.txLinks?.[txId]?.auto === true;
    return (
      <div className="rounded-2xl border border-line bg-panel p-3 flex items-center justify-between gap-3">
        <p className="text-style-caption text-subtle">
          {copy.linkedPrefix} «{linkedDebt.name}»
          {isAuto && <span> · {autoLabel}</span>}
        </p>
        <Button
          variant="ghost"
          module="finyk"
          size="xs"
          onClick={() => setLinkedTxRole(linkedDebt.id, txId, "debt", null)}
        >
          {shared.unlink}
        </Button>
      </div>
    );
  }

  // Платіж без жодного наявного пасиву — привʼязувати нема до чого.
  // Кнопка «створити» тут була б мертвою (§ докблок): пасив, який
  // народжується вже сплаченим, не має сенсу.
  if (isPayment && manualDebts.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-3 space-y-1">
        <p className="text-style-caption text-subtle">{copy.prompt}</p>
        <p className="text-style-caption text-muted">{shared.noDebtsHint}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-3 space-y-2">
      <p className="text-style-caption text-subtle">{copy.prompt}</p>
      <div className="flex gap-2">
        {manualDebts.length > 0 && (
          <Button
            variant="secondary"
            module="finyk"
            size="sm"
            className="flex-1"
            onClick={() => setShowPicker(true)}
          >
            {copy.linkExisting}
          </Button>
        )}
        {!isPayment && (
          <Button
            variant="secondary"
            module="finyk"
            size="sm"
            className="flex-1"
            onClick={() => setShowCreateForm(true)}
          >
            {shared.createNew}
          </Button>
        )}
      </div>

      <Sheet
        open={showPicker}
        onClose={() => setShowPicker(false)}
        title={shared.pickTitle}
      >
        <div className="space-y-2">
          {manualDebts.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => linkExisting(d.id)}
              className="w-full touch-target rounded-xl border border-line px-4 py-3 text-left hover:bg-panelHi transition-colors flex items-center justify-between gap-2"
            >
              <span className="text-style-label text-text">{d.name}</span>
              <Money
                amount={-(d.totalAmount ?? d.amount ?? 0)}
                signed
                tone="inherit"
                className="text-danger-strong dark:text-danger"
              />
            </button>
          ))}
        </div>
      </Sheet>

      {!isPayment && (
        <Sheet
          open={showCreateForm}
          onClose={() => setShowCreateForm(false)}
          title={shared.createTitle}
        >
          <div className="space-y-3">
            <p className="text-style-caption text-subtle inline-flex items-center gap-1.5">
              <Icon name="calendar" size={13} aria-hidden />
              <Money amount={amountUAH} />
              {dateLabel ? ` · ${dateLabel}` : null}
            </p>
            <Input
              aria-label={shared.namePlaceholder}
              placeholder={shared.namePlaceholder}
              maxLength={NAME_MAX_LEN}
              showCharCount={false}
              value={newDebtName}
              onChange={(e) => setNewDebtName(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                size="sm"
                disabled={!newDebtName.trim()}
                onClick={createDebt}
              >
                {shared.create}
              </Button>
              <Button
                className="flex-1"
                size="sm"
                variant="secondary"
                onClick={() => setShowCreateForm(false)}
              >
                {shared.cancel}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
