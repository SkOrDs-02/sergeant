/**
 * Last validated: 2026-08-18
 * Status: Active — Silpo MCP integration, track B (finyk receipt
 * enrichment). See `docs/90-work/planning/specs/silpo-mcp-integration.md`
 * § Рішення дизайну «Спліт — пропозиція, не мовчазний запис».
 *
 * "Чек" section inside `BankTransactionDetailsSheet` — shows Silpo receipt
 * line items for a matched mono transaction, plus a one-tap "Розбити за
 * чеком" proposal that turns the receipt's category breakdown into
 * `TxSplit[]` via the SAME write path `TxRowSplitEditor` uses
 * (`onSplitChange` → `setSplitTx` in `useFinykStorageMutations`) — no
 * parallel split mechanism, no server-side write (`TxSplit` is a
 * client-only, dual-write entity; the server never sees it).
 *
 * Renders nothing when there's no link (no Silpo account connected, no
 * match found, or the integration is off) — this is a first-class
 * "nothing to show" case, not an error (spec § Рішення дизайну —
 * "транзакція без чека виглядає як сьогодні").
 *
 * The proposal never writes silently: tapping "Розбити за чеком" only
 * expands a preview card (categories + sums come from
 * `suggestSplitsFromReceiptItems`, `@sergeant/finyk-domain`); the split is
 * written on an explicit "Підтвердити" tap. If the transaction already has
 * a manual split, confirming overwrites it — flagged inline so that isn't
 * silent either.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { formatReceiptQty } from "@shared/lib/format/receiptQty";
import { suggestSplitsFromReceiptItems } from "@sergeant/finyk-domain/domain/receiptSplitSuggestion";
import { canonicalManualCategoryId } from "@sergeant/finyk-domain/lib/manualTaxonomy";
import { resolveExpenseCategoryMeta } from "@sergeant/finyk-domain/domain/categories";
import type { TxSplit } from "@sergeant/finyk-domain/domain/types";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import { useSilpoReceiptForTransaction } from "@finyk/hooks/useSilpoReceipts";
import {
  useSilpoRelinkReceipt,
  useSilpoUnlinkReceipt,
} from "@finyk/hooks/useSilpoMutations";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import { CATEGORY_ICON_MAP, stripLeadingEmoji } from "./txRowHelpers";
import { SilpoReceiptPickerSheet } from "./SilpoReceiptPickerSheet";

// Discoverability CTA (§ audit finding): a not-yet-connected user opening a
// Silpo-looking transaction saw nothing — the section only ever rendered
// for `status === "connected"`. Matches both Cyrillic and Latin spelling
// since bank-fed descriptions aren't normalized.
const SILPO_MERCHANT_RE = /сільпо|silpo/i;

export interface SilpoReceiptSectionProps {
  transactionId: string;
  /** Raw bank description/merchant of the transaction, used only to decide
   * whether to show the "connect Сільпо" discoverability CTA when not yet
   * connected. */
  transactionDescription?: string | undefined;
  /** Сума зматченої банківської транзакції в копійках (ціле, додатне —
   * модуль). Авторитетний total для сплітів: matcher лінкує чек за
   * `receipt_id`, тож `totalKop` чека може розійтися з фактичним
   * списанням (знижки, часткова оплата) — сплити мають сумуватись у те,
   * що реально списалось з картки, а не в номінал чека. */
  transactionAmountKop: number;
  /** Дата операції в ISO. Потрібна лише пікеру «Прикріпити чек» — він
   * сортує чеки за близькістю до неї. Без неї пікер лишається робочим,
   * просто в хронологічному порядку. */
  transactionDateIso?: string | undefined;
  /** Той самий сетер, що `TxRowSplitEditor` (`onSplitChange` пропа
   * `BankTransactionDetailsSheet` → `setSplitTx`). */
  onSplitChange: (id: string, splits: TxSplit[] | null) => void;
  customCategories?: readonly CustomCategoryInput[];
  /** Кількість наявних часток ручного спліту — якщо >0, підтвердження
   * пропозиції його замінить, і про це варто попередити. */
  existingSplitsCount?: number;
}

/**
 * Копійки чека → готовий `TxSplit[]` у гривнях, звірений із сумою
 * зматченої транзакції.
 *
 * Канонізація id (`groceries` → `food`): мапер навмисно лягає в
 * `manualTaxonomy` (детальний ручний слаг), а категорії, якими живуть
 * банківські транзакції (пікер спліту, `calcCategorySpent`, аналітика),
 * побудовані з `MCC_CATEGORIES` — там `groceries` немає взагалі, лише
 * `food`. Без канонізації спліт писав гроші під id, якого немає в жодному
 * списку категорій витрат — сума мовчки зникала з аналітики (той самий
 * фікс, що вже стоїть у `useWeeklyDigest.ts` для агрегації категорій).
 *
 * Reconciliation проти `totalKop` (= сума ТРАНЗАКЦІЇ, не номінал чека):
 *  - недобір (знижки, позиції без цінника) йде в «Продукти» — той самий
 *    дефолт, що й у самого мапера для нерозпізнаних позицій;
 *  - перебір (позиції чека > списання — знижка «на касі», часткова
 *    оплата) пропорційно масштабує бакети до `totalKop` у цілих
 *    копійках, а пост-раундинговий залишок детерміновано віддає
 *    найбільшому бакету. Раніше перебір фолдився у food-бакет,
 *    робив його відʼємним, фільтр позитивних його викидав — і сума
 *    сплітів ПЕРЕВИЩУВАЛА total. Тепер фінальні позитивні сплити
 *    сумуються РІВНО в `totalKop`.
 */
function buildFinalSplits(
  suggestion: ReturnType<typeof suggestSplitsFromReceiptItems>,
  totalKop: number,
): TxSplit[] {
  if (!Number.isFinite(totalKop) || totalKop <= 0) return [];
  const byCanonical = new Map<string, number>();
  for (const split of suggestion.splits) {
    const canonicalId = canonicalManualCategoryId(split.categoryId);
    byCanonical.set(
      canonicalId,
      (byCanonical.get(canonicalId) ?? 0) + split.amountKop,
    );
  }
  const buckets = [...byCanonical.entries()]
    .filter(([, amountKop]) => amountKop > 0)
    .map(([categoryId, amountKop]) => ({ categoryId, amountKop }));
  const splitTotalKop = buckets.reduce((sum, b) => sum + b.amountKop, 0);
  const remainderKop = totalKop - splitTotalKop;
  if (remainderKop > 0) {
    const groceriesCanonical = canonicalManualCategoryId("groceries");
    const grocery = buckets.find((b) => b.categoryId === groceriesCanonical);
    if (grocery) grocery.amountKop += remainderKop;
    else
      buckets.push({ categoryId: groceriesCanonical, amountKop: remainderKop });
  } else if (remainderKop < 0 && splitTotalKop > 0) {
    const [firstBucket] = buckets;
    if (firstBucket) {
      const largest = buckets.reduce(
        (max, b) => (b.amountKop > max.amountKop ? b : max),
        firstBucket,
      );
      let scaledSum = 0;
      for (const bucket of buckets) {
        bucket.amountKop = Math.floor(
          (bucket.amountKop * totalKop) / splitTotalKop,
        );
        scaledSum += bucket.amountKop;
      }
      largest.amountKop += totalKop - scaledSum;
    }
  }
  return buckets
    .map(({ categoryId, amountKop }) => ({
      categoryId,
      amount: amountKop / 100,
    }))
    .filter((split) => split.amount > 0)
    .sort(
      (a, b) => b.amount - a.amount || a.categoryId.localeCompare(b.categoryId),
    );
}

export function SilpoReceiptSection({
  transactionId,
  transactionDescription,
  transactionAmountKop,
  transactionDateIso,
  onSplitChange,
  customCategories = [],
  existingSplitsCount = 0,
}: SilpoReceiptSectionProps) {
  const copy = messages.finyk.silpoReceipt;
  const navigate = useNavigate();
  // Свідомо БЕЗ `useToast`: ця секція рендериться в деталях кожної
  // витратної транзакції, а `ToastProvider` є не в кожному з тих дерев —
  // контекстний хук тут поклав би весь sheet замість того, щоб показати
  // повідомлення. Успіх видно й так (чек зникає після інвалідації), а
  // помилку показуємо рядком поруч із кнопкою.
  const unlinkMutation = useSilpoUnlinkReceipt();
  const relinkMutation = useSilpoRelinkReceipt();
  // Чек, який щойно відчепили. Тримаємо ЛОКАЛЬНО, бо після інвалідації
  // `summary` стає порожнім і секція зникла б разом із можливістю
  // скасувати — а саме безповоротність і була скаргою.
  const [undoneReceiptId, setUndoneReceiptId] = useState<string | null>(null);
  const { status } = useSilpoSyncState();
  const { summary, detail, isLoading } = useSilpoReceiptForTransaction(
    transactionId,
    { enabled: status === "connected" },
  );
  const [proposalOpen, setProposalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const items = useMemo(() => detail?.items ?? [], [detail]);
  const suggestion = useMemo(
    () =>
      suggestSplitsFromReceiptItems(
        items.map((item) => ({
          name: item.name,
          categorySlug: item.categorySlug,
          priceKop: item.priceKop,
          qty: item.qty,
        })),
      ),
    [items],
  );
  const finalSplits = useMemo(
    () => buildFinalSplits(suggestion, transactionAmountKop),
    [suggestion, transactionAmountKop],
  );
  // Гейт на ПОСТ-канонізованих фінальних частках, не на сирій пропозиції:
  // після злиття `groceries`→`food` і reconciliation частка може лишитись
  // одна навіть при `singleCategory === false` — тоді спліт не потрібен і
  // CTA вимкнено. `suggestion.singleCategory` лишається лише для caption
  // `singleCategoryHint` нижче.
  const canPropose = finalSplits.length >= 2;

  if (isLoading) return null;

  // Рівно `disconnected`, а НЕ будь-що крім `connected`. `SilpoIntegrationStatus`
  // має пʼять значень, і три з них кликати до дії не можна:
  //   • `disabled` — `SILPO_ENABLED=false` на сервері, тобто звʼязати
  //     НЕМОЖЛИВО. Це дефолт і поточний стан проду, тож ширша умова
  //     показала б банер геть усім, а кнопка вела б у налаштування, де
  //     написано «Інтеграція ще не увімкнена» — глухий кут замість запрошення.
  //   • `unknown` — перевірка стану не вдалася; ми не знаємо, чи людина вже
  //     підключена, і пропонувати підключитись наосліп — обман.
  //   • `reauth_required` — звʼязок Є, просто протух; про це вже кричить
  //     власний банер на картці в налаштуваннях, дублювати не треба.
  // Один прапорець на дві гілки нижче: і банер «Звʼязати Сільпо» для
  // непідключеного, і «Прикріпити чек» для підключеного без пари мають
  // зʼявлятись рівно на операціях Сільпо, а не на кожній витраті.
  const looksLikeSilpo = Boolean(
    transactionDescription && SILPO_MERCHANT_RE.test(transactionDescription),
  );

  if (status === "disconnected") {
    if (!looksLikeSilpo) return null;
    return (
      <section className="rounded-2xl border border-line bg-panel p-3">
        <div className="flex items-center gap-2">
          <Icon
            name="shopping-cart"
            size={16}
            className="text-muted shrink-0"
            aria-hidden
          />
          <h3 className="text-style-label text-text">
            {copy.connectPromptTitle}
          </h3>
        </div>
        <p className="mt-1 text-style-caption text-muted">
          {copy.connectPromptHint}
        </p>
        <Button
          variant="secondary"
          module="finyk"
          size="sm"
          className="mt-2"
          onClick={() => navigate("/settings?group=modules#settings-finyk")}
        >
          {copy.connectPromptCta}
        </Button>
      </section>
    );
  }

  // Відчеплено — але поки в цьому екрані, пропонуємо повернути. Живе
  // рівно до закриття деталей транзакції: undo без дедлайну вимагав би
  // серверного журналу дій, а тут вистачає життя компонента.
  if (!summary && undoneReceiptId) {
    return (
      <section className="rounded-2xl border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-style-caption text-muted">{copy.unlinkDone}</p>
          <button
            type="button"
            disabled={relinkMutation.isPending}
            onClick={() =>
              relinkMutation.mutate(
                { transactionId, receiptId: undoneReceiptId },
                { onSuccess: () => setUndoneReceiptId(null) },
              )
            }
            className="touch-target rounded-xl px-3 text-style-label text-finyk transition-colors hover:text-text disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk"
          >
            {relinkMutation.isPending
              ? copy.unlinkUndoPending
              : copy.unlinkUndo}
          </button>
        </div>
        {relinkMutation.isError && (
          <p role="alert" className="mt-1 text-style-caption text-danger">
            {copy.unlinkUndoFailed}
          </p>
        )}
      </section>
    );
  }

  // Чека немає, але операція виглядає як Сільпо — пропонуємо прикріпити
  // вручну. Це вихід для всього, що matcher чесно пропустив: родинна
  // карта, готівка, покупка старіша за завантажену історію банку.
  if (!summary) {
    // Рівно `connected`, з тієї ж причини, що й банер вище: під
    // `disabled` (SILPO_ENABLED=false, дефолт проду) прикріплювати
    // нічого — усі роути віддають 503, і кнопка вела б у нікуди. Під
    // `unknown` / `reauth_required` — так само не час пропонувати дію.
    if (status !== "connected" || !looksLikeSilpo) return null;
    return (
      <>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="touch-target rounded-xl px-3 text-style-caption text-subtle transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk"
          >
            {messages.finyk.silpoReceiptPicker.cta}
          </button>
        </div>
        <SilpoReceiptPickerSheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          transactionId={transactionId}
          transactionAmountKop={transactionAmountKop}
          transactionDateIso={transactionDateIso ?? ""}
        />
      </>
    );
  }

  const confirmSplit = () => {
    // `null` у `onSplitChange` означає «видалити спліт» — підтвердження
    // пропозиції НІКОЛИ не стирає наявний ручний спліт користувача.
    if (finalSplits.length < 2) return;
    onSplitChange(transactionId, finalSplits);
    setProposalOpen(false);
  };

  return (
    <section className="rounded-2xl border border-line bg-panel p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            name="shopping-cart"
            size={16}
            className="text-muted shrink-0"
            aria-hidden
          />
          <h3 className="text-style-label text-text">{copy.title}</h3>
        </div>
        <Button
          variant="secondary"
          module="finyk"
          size="xs"
          disabled={!canPropose}
          aria-expanded={proposalOpen}
          onClick={() => setProposalOpen((open) => !open)}
        >
          <Icon name="shuffle" size={15} aria-hidden />
          {copy.splitCta}
        </Button>
      </div>
      {/* `title` on a disabled button is unreachable by keyboard/screen
          reader/touch (§ code review PR #819) — a visible caption next to
          the CTA carries the "чому кнопка неактивна" explanation to
          everyone. Only shown once items actually loaded — before that the
          `itemsPending` caption below already covers "чому нічого нема". */}
      {items.length > 0 && suggestion.singleCategory && (
        <p className="mt-1 text-right text-style-caption text-subtle">
          {copy.singleCategoryHint}
        </p>
      )}

      {proposalOpen && canPropose && (
        <div className="mt-3 space-y-2 rounded-xl border border-line bg-panelHi p-3">
          <p className="text-style-caption text-subtle">{copy.proposalTitle}</p>
          <ul className="space-y-1.5">
            {finalSplits.map((split) => {
              const meta = resolveExpenseCategoryMeta(
                split.categoryId,
                customCategories,
              );
              return (
                <li
                  key={split.categoryId}
                  className="flex items-center justify-between gap-2 text-style-body"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon
                      name={CATEGORY_ICON_MAP[split.categoryId] ?? "tag"}
                      size={15}
                      aria-hidden
                    />
                    <span className="truncate text-text">
                      {stripLeadingEmoji(meta?.label ?? split.categoryId)}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-text">
                    <Money amount={split.amount} kopecks />
                  </span>
                </li>
              );
            })}
          </ul>
          {existingSplitsCount > 0 && (
            <p className="text-style-caption text-warning-strong dark:text-warning">
              {copy.overwriteWarning}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              variant="primary"
              module="finyk"
              size="xs"
              className="flex-1"
              onClick={confirmSplit}
            >
              {copy.proposalConfirm}
            </Button>
            <button
              type="button"
              onClick={() => setProposalOpen(false)}
              className="touch-target rounded-xl border border-line px-3 text-style-caption text-subtle transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk"
            >
              {copy.proposalCancel}
            </button>
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const qtyLabel = formatReceiptQty(item.qty, item.unit);
            return (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 text-style-body"
              >
                <div className="min-w-0">
                  <p className="text-text truncate">{item.name}</p>
                  {qtyLabel && (
                    <p className="text-style-caption text-subtle">{qtyLabel}</p>
                  )}
                </div>
                <p className="shrink-0 tabular-nums text-text">
                  <Money amount={item.priceKop / 100} kopecks />
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-style-caption text-subtle">
          {copy.itemsPending}
        </p>
      )}

      {/* «Це не той чек» — matcher звʼязує за збігом суми у вікні ±1 доба,
          тож покупка іншої людини на ту саму суму дає хибну пару. Дія тиха
          і текстова, не кнопка-акцент: помилковий матч — рідкісний випадок,
          а сусідній «Розбити за чеком» лишається головним. */}
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-line pt-2">
        {unlinkMutation.isError && (
          <p role="alert" className="text-style-caption text-danger">
            {copy.unlinkFailed}
          </p>
        )}
        <button
          type="button"
          disabled={unlinkMutation.isPending}
          onClick={() =>
            unlinkMutation.mutate(transactionId, {
              onSuccess: ({ receiptId }) => setUndoneReceiptId(receiptId),
            })
          }
          className="touch-target rounded-xl px-3 text-style-caption text-subtle transition-colors hover:text-text disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk"
        >
          {unlinkMutation.isPending ? copy.unlinkPending : copy.unlinkCta}
        </button>
      </div>
    </section>
  );
}
