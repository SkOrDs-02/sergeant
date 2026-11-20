/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Джерело Фініка для глобального пошуку (⌘K). Винесено з `searchSources.ts`
 * разом із Ф-2 (а) (рішення власника OD-26, 2026-11-18): пошук бачить і
 * банківські операції, і ручні записи, шукає також за нотаткою й тегом, а
 * хіт операції веде на саму операцію (`/finyk/transactions?tx=<id>`), а не
 * на головну модуля.
 *
 * Нотатки й теги беруть участь у скорингу через «довгий» підпис, але на
 * екран іде короткий (сума · дата), як у каталозі вправ Фізрука.
 */
import { formatMoney, formatMoneyFromKopecks } from "@sergeant/shared";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import { getVisibleFinykMonoMirrorState } from "@finyk/lib/monoMirrorReader";
import { getCachedFinykSqliteState } from "@finyk/lib/sqliteReader";
import { finykTransactionPath } from "@finyk/lib/finykRouter";
import { type Hit, localDateKey, pushScored } from "./searchTypes";

interface FinykTx {
  id?: string;
  time?: number;
  amount?: number;
  description?: string;
  comment?: string;
}

interface FinykSub {
  id?: string;
  name?: string;
  amount?: number;
}

const MODULE_LABEL = "Фінік";

function shortSubtitle(amountMinor: number, time: number): string {
  const amount = (Number.isFinite(amountMinor) ? amountMinor : 0) / 100;
  // `time` у секундах (банк, ручні записи); мілісекунди лишились у старих
  // знімках дзеркала.
  const date =
    time > 1e10
      ? localDateKey(new Date(time))
      : localDateKey(new Date(time * 1000));
  return `${formatMoney(amount, { signed: true, maxFractionDigits: 2 })} · ${date}`;
}

function txHit(
  id: string,
  title: string,
  amountMinor: number,
  time: number,
  extra: readonly string[],
): { hit: Omit<Hit, "_score">; display: string } {
  const display = shortSubtitle(amountMinor, time);
  const searchable = extra.filter(Boolean).join(" ");
  return {
    display,
    hit: {
      id: `finyk_tx_${id}`,
      module: "finyk",
      moduleLabel: MODULE_LABEL,
      title,
      subtitle: searchable ? `${display} · ${searchable}` : display,
      icon: "credit-card",
      target: {
        kind: "module",
        moduleId: "finyk",
        path: finykTransactionPath(id),
      },
    },
  };
}

export function searchFinyk(tokens: string[]): Hit[] {
  const cache = getCachedFinykSqliteState();
  const notes = cache.txNotes ?? {};
  const tags = cache.txTags ?? {};
  const displayById = new Map<string, string>();

  // Ручні записи: окремий ліміт, щоб довга банківська історія їх не витіснила.
  const manualHits: Hit[] = [];
  for (const entry of cache.manualExpenses ?? []) {
    if (!entry || typeof entry !== "object" || !entry.id) continue;
    const tx = manualExpenseToTransaction(entry);
    const { hit, display } = txHit(
      tx.id,
      tx.description || "Операція",
      tx.amount,
      tx.time,
      [notes[tx.id] ?? "", ...(tags[tx.id] ?? [])],
    );
    displayById.set(hit.id, display);
    if (pushScored(manualHits, hit, tokens, 10)) break;
  }

  const bankHits: Hit[] = [];
  const txList = getVisibleFinykMonoMirrorState().transactions as FinykTx[];
  if (Array.isArray(txList)) {
    for (const tx of txList) {
      if (!tx || typeof tx !== "object") continue;
      const time = tx.time ?? 0;
      const id = tx.id || String(time);
      const { hit, display } = txHit(
        id,
        tx.description || tx.comment || "Операція",
        Number(tx.amount),
        time,
        [tx.comment ?? "", notes[id] ?? "", ...(tags[id] ?? [])],
      );
      displayById.set(hit.id, display);
      if (pushScored(bankHits, hit, tokens, 20)) break;
    }
  }

  // Підписки пишуться лише в SQLite (LS-ключ `finyk_subs` — tombstone),
  // тож пошук читає SQLite-кеш Фініка.
  const subHits: Hit[] = [];
  const subs = cache.subscriptions as FinykSub[];
  if (Array.isArray(subs)) {
    for (const s of subs) {
      if (!s || typeof s !== "object") continue;
      const amtRaw = Number(s.amount);
      const amt = Number.isFinite(amtRaw) && amtRaw > 0 ? amtRaw : 0;
      pushScored(
        subHits,
        {
          id: `finyk_sub_${s.id}`,
          module: "finyk",
          moduleLabel: MODULE_LABEL,
          title: s.name || "Підписка",
          subtitle: `Підписка · ${amt ? formatMoneyFromKopecks(amt) : ""}`,
          icon: "refresh-cw",
          target: { kind: "module", moduleId: "finyk" },
        },
        tokens,
        25,
      );
    }
  }

  const top = [...manualHits, ...bankHits, ...subHits]
    .sort((a, b) => b._score - a._score)
    .slice(0, 10);
  for (const r of top) {
    const display = displayById.get(r.id);
    if (display) r.subtitle = display;
  }
  return top;
}

/**
 * Сигнал змін для LRU пошуку: ручні записи, нотатки й теги. Довжини й id
 * замість повних рядків, як решта знімка в `searchSources.ts`.
 */
export function finykManualSearchSnapshot(): string {
  const cache = getCachedFinykSqliteState();
  const manual = (cache.manualExpenses ?? [])
    .map((e) => `${e?.id ?? ""}${e?.description ?? ""}`)
    .join("|");
  const notes = Object.entries(cache.txNotes ?? {})
    .map(([id, n]) => `${id}${n?.length ?? 0}`)
    .join("|");
  const tags = Object.entries(cache.txTags ?? {})
    .map(([id, t]) => `${id}${t.join(",")}`)
    .join("|");
  return `m:${manual},tn:${notes},tt:${tags}`;
}
