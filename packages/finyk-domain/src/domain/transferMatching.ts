import { INTERNAL_TRANSFER_ID } from "../constants";
import type { Transaction, TxCategoriesMap } from "./types";

const DEFAULT_MAX_TIME_DELTA_SECONDS = 6 * 60 * 60;

const TRANSFER_MARKER_RE =
  /(?:переказ\p{L}*|перевод\p{L}*|\btransfer\w*\b|між\s+(?:власними\s+)?(?:картк|рахунк)|(?:з|із|на)\s+картк|(?:з|із|на|у)\s+банк(?:у|и)?|\bjar\b)/iu;

const REAL_INCOME_MARKER_RE =
  /(?:кешбек|cashback|відсот|процент|interest|зарплат|salary)/iu;

export interface TransferMatchOptions {
  txCategories?: TxCategoriesMap | undefined;
  maxTimeDeltaSeconds?: number | undefined;
}

export interface InternalTransferSuggestion {
  outgoing: Transaction;
  incoming: Transaction;
  amountMinor: number;
  timeDeltaSeconds: number;
}

interface MatchEdge extends InternalTransferSuggestion {
  markerCount: number;
}

function accountIdOf(tx: Transaction): string | null {
  const value = tx.accountId ?? tx._accountId;
  return typeof value === "string" && value.trim() ? value : null;
}

function timeSecondsOf(tx: Transaction): number | null {
  const value = Number(tx.time);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
}

function currencyCodeOf(tx: Transaction): number | null {
  const value = Number(tx["currencyCode"]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function descriptionOf(tx: Transaction): string {
  return [tx.description, tx.merchant, tx.note]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .trim();
}

function isAlreadyTransfer(
  tx: Transaction,
  txCategories: TxCategoriesMap,
): boolean {
  return (
    txCategories[tx.id] === INTERNAL_TRANSFER_ID ||
    tx.categoryId === INTERNAL_TRANSFER_ID ||
    tx.type === "transfer"
  );
}

function compareEdges(a: MatchEdge, b: MatchEdge): number {
  if (a.markerCount !== b.markerCount) return b.markerCount - a.markerCount;
  if (a.timeDeltaSeconds !== b.timeDeltaSeconds) {
    return a.timeDeltaSeconds - b.timeDeltaSeconds;
  }
  const aKey = `${a.outgoing.id}:${a.incoming.id}`;
  const bKey = `${b.outgoing.id}:${b.incoming.id}`;
  return aKey.localeCompare(bKey);
}

function bestUnambiguousEdge(
  txId: string,
  edges: readonly MatchEdge[],
): MatchEdge | null {
  const ranked = edges
    .filter((edge) => edge.outgoing.id === txId || edge.incoming.id === txId)
    .sort(compareEdges);
  const first = ranked[0];
  if (!first) return null;
  const second = ranked[1];
  if (
    second &&
    second.markerCount === first.markerCount &&
    second.timeDeltaSeconds === first.timeDeltaSeconds
  ) {
    return null;
  }
  return first;
}

/**
 * Finds high-confidence internal-transfer pairs without changing any data.
 *
 * A suggestion needs opposite signs, exactly equal absolute minor units,
 * different account ids, compatible currency, a transfer-like description,
 * and a short time distance. The edge must be the unique best match for both
 * endpoints. Ambiguous groups intentionally produce no result: user-facing
 * analytics must not change on a guess.
 */
export function findInternalTransferSuggestions(
  transactions: readonly Transaction[] | null | undefined,
  options: TransferMatchOptions = {},
): InternalTransferSuggestion[] {
  const list = Array.isArray(transactions) ? transactions : [];
  const txCategories = options.txCategories ?? {};
  const configuredDelta = Number(options.maxTimeDeltaSeconds);
  const maxTimeDeltaSeconds =
    Number.isFinite(configuredDelta) && configuredDelta > 0
      ? configuredDelta
      : DEFAULT_MAX_TIME_DELTA_SECONDS;
  const edges: MatchEdge[] = [];

  for (let i = 0; i < list.length; i += 1) {
    const left = list[i];
    if (!left || left.amount === 0) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      const right = list[j];
      if (
        !right ||
        right.amount === 0 ||
        Math.sign(left.amount) === Math.sign(right.amount)
      ) {
        continue;
      }
      if (Math.abs(left.amount) !== Math.abs(right.amount)) continue;

      const leftAccountId = accountIdOf(left);
      const rightAccountId = accountIdOf(right);
      if (
        !leftAccountId ||
        !rightAccountId ||
        leftAccountId === rightAccountId
      ) {
        continue;
      }

      const leftCurrency = currencyCodeOf(left);
      const rightCurrency = currencyCodeOf(right);
      if (
        leftCurrency !== null &&
        rightCurrency !== null &&
        leftCurrency !== rightCurrency
      ) {
        continue;
      }

      const leftTime = timeSecondsOf(left);
      const rightTime = timeSecondsOf(right);
      if (leftTime === null || rightTime === null) continue;
      const timeDeltaSeconds = Math.abs(leftTime - rightTime);
      if (timeDeltaSeconds > maxTimeDeltaSeconds) continue;

      const leftDescription = descriptionOf(left);
      const rightDescription = descriptionOf(right);
      if (
        REAL_INCOME_MARKER_RE.test(leftDescription) ||
        REAL_INCOME_MARKER_RE.test(rightDescription)
      ) {
        continue;
      }
      const markerCount =
        Number(TRANSFER_MARKER_RE.test(leftDescription)) +
        Number(TRANSFER_MARKER_RE.test(rightDescription));
      if (markerCount === 0) continue;

      const outgoing = left.amount < 0 ? left : right;
      const incoming = left.amount > 0 ? left : right;
      if (
        isAlreadyTransfer(outgoing, txCategories) &&
        isAlreadyTransfer(incoming, txCategories)
      ) {
        continue;
      }

      edges.push({
        outgoing,
        incoming,
        amountMinor: Math.abs(outgoing.amount),
        timeDeltaSeconds,
        markerCount,
      });
    }
  }

  const accepted = edges.filter((edge) => {
    const outgoingBest = bestUnambiguousEdge(edge.outgoing.id, edges);
    const incomingBest = bestUnambiguousEdge(edge.incoming.id, edges);
    return outgoingBest === edge && incomingBest === edge;
  });

  return accepted
    .sort((a, b) => {
      const aTime = Math.min(
        timeSecondsOf(a.outgoing) ?? 0,
        timeSecondsOf(a.incoming) ?? 0,
      );
      const bTime = Math.min(
        timeSecondsOf(b.outgoing) ?? 0,
        timeSecondsOf(b.incoming) ?? 0,
      );
      if (aTime !== bTime) return bTime - aTime;
      return `${a.outgoing.id}:${a.incoming.id}`.localeCompare(
        `${b.outgoing.id}:${b.incoming.id}`,
      );
    })
    .map(({ markerCount: _markerCount, ...suggestion }) => suggestion);
}
