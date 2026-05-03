import {
  FINYK_CUSTOM_CATS_KEY,
  FINYK_MANUAL_EXPENSES_KEY,
  FINYK_MANUAL_ONLY_KEY,
  FINYK_MONTHLY_PLAN_KEY,
  FINYK_TX_CACHE_KEY,
  FINYK_TX_CACHE_LAST_GOOD_KEY,
} from "./keys";
import {
  type ManualExpense,
  buildMonoTx,
  daysAgo,
  shortId,
  toISO,
  writeJSON,
  writeRaw,
} from "./utils";

export function seedFinyk(): void {
  // Current-month transactions presented as Monobank statement rows.
  // Populates `finyk_tx_cache` so Overview's spent/income totals, the
  // Analytics page, and the Transactions list all render with real
  // numbers — `useMonobank` hydrates `realTx` from this snapshot when
  // no token is connected (manual-only mode).
  //
  // `d` is days-ago, `h` is hour of day. MCCs are realistic so the
  // auto-categoriser routes each tx to the expected bucket without us
  // having to pre-assign `finyk_tx_cats`.
  const monoSpec: Array<{
    d: number;
    h: number;
    amount: number;
    description: string;
    mcc: number;
    kind: "expense" | "income";
  }> = [
    {
      d: 0,
      h: 9,
      amount: 145,
      mcc: 5411,
      description: "Сільпо",
      kind: "expense",
    },
    {
      d: 0,
      h: 13,
      amount: 220,
      mcc: 5812,
      description: "Піца Celentano",
      kind: "expense",
    },
    {
      d: 0,
      h: 18,
      amount: 85,
      mcc: 4121,
      description: "Bolt",
      kind: "expense",
    },
    {
      d: 1,
      h: 10,
      amount: 390,
      mcc: 5411,
      description: "АТБ",
      kind: "expense",
    },
    {
      d: 1,
      h: 20,
      amount: 199,
      mcc: 4899,
      description: "Netflix",
      kind: "expense",
    },
    {
      d: 2,
      h: 12,
      amount: 60,
      mcc: 4111,
      description: "Київський метрополітен",
      kind: "expense",
    },
    {
      d: 2,
      h: 19,
      amount: 450,
      mcc: 5812,
      description: "Вечеря з друзями",
      kind: "expense",
    },
    {
      d: 3,
      h: 11,
      amount: 1200,
      mcc: 5732,
      description: "Rozetka",
      kind: "expense",
    },
    {
      d: 4,
      h: 8,
      amount: 35,
      mcc: 5814,
      description: "Aroma Kava",
      kind: "expense",
    },
    {
      d: 4,
      h: 17,
      amount: 980,
      mcc: 5912,
      description: "Аптека АНЦ",
      kind: "expense",
    },
    {
      d: 5,
      h: 14,
      amount: 550,
      mcc: 5411,
      description: "Сільпо",
      kind: "expense",
    },
    {
      d: 5,
      h: 9,
      amount: 45000,
      mcc: 0,
      description: "ФОП надходження",
      kind: "income",
    },
    {
      d: 6,
      h: 13,
      amount: 320,
      mcc: 5812,
      description: "Суші Woк",
      kind: "expense",
    },
    {
      d: 7,
      h: 10,
      amount: 1800,
      mcc: 5541,
      description: "WOG",
      kind: "expense",
    },
    {
      d: 7,
      h: 21,
      amount: 129,
      mcc: 4899,
      description: "Spotify",
      kind: "expense",
    },
    {
      d: 8,
      h: 15,
      amount: 720,
      mcc: 5651,
      description: "Zara",
      kind: "expense",
    },
    {
      d: 9,
      h: 9,
      amount: 95,
      mcc: 5814,
      description: "Львівська пекарня",
      kind: "expense",
    },
    {
      d: 10,
      h: 18,
      amount: 410,
      mcc: 7832,
      description: "Планета Кіно",
      kind: "expense",
    },
    {
      d: 11,
      h: 12,
      amount: 260,
      mcc: 5411,
      description: "Новус",
      kind: "expense",
    },
    {
      d: 12,
      h: 19,
      amount: 150,
      mcc: 5814,
      description: "Lviv Croissants",
      kind: "expense",
    },
    {
      d: 13,
      h: 16,
      amount: 85,
      mcc: 4121,
      description: "Uber",
      kind: "expense",
    },
    {
      d: 14,
      h: 11,
      amount: 620,
      mcc: 5411,
      description: "Сільпо",
      kind: "expense",
    },
    {
      d: 15,
      h: 20,
      amount: 280,
      mcc: 5812,
      description: "Puzata Hata",
      kind: "expense",
    },
  ];

  const monoTxs = monoSpec.map((s, i) =>
    buildMonoTx(
      1800 + i,
      daysAgo(s.d, s.h, 0),
      s.amount,
      s.description,
      s.mcc,
      s.kind,
    ),
  );

  // Snapshot format expected by `useMonobank.loadCacheSnapshot`.
  const snapshot = { txs: monoTxs, timestamp: Date.now() };
  writeJSON(FINYK_TX_CACHE_KEY, snapshot);
  writeJSON(FINYK_TX_CACHE_LAST_GOOD_KEY, snapshot);

  // A handful of manual expenses alongside the bank stream, so the
  // «Ручні витрати» section has content and the Transactions page
  // shows the manual-entry chip in its list.
  const manualSpec: Array<
    Omit<ManualExpense, "id" | "date"> & { d: number; h: number }
  > = [
    { d: 0, h: 8, amount: 45, category: "food", description: "Кава на винос" },
    {
      d: 1,
      h: 14,
      amount: 120,
      category: "transport",
      description: "Таксі додому",
    },
    {
      d: 2,
      h: 20,
      amount: 260,
      category: "entertainment",
      description: "Квиток на концерт",
    },
    { d: 4, h: 11, amount: 75, category: "food", description: "Бізнес-ланч" },
  ];

  const transactions: ManualExpense[] = manualSpec.map((s, i) => ({
    id: shortId("demo_fx", 1700 + i),
    date: toISO(daysAgo(s.d, s.h, 0)),
    description: s.description,
    amount: s.amount,
    category: s.category,
  }));
  writeJSON(FINYK_MANUAL_EXPENSES_KEY, transactions);

  // Leave custom categories empty — MCC base set covers the seeded
  // expenses and gives the pie-chart enough variety out of the box.
  writeJSON(FINYK_CUSTOM_CATS_KEY, []);

  // Monthly plan so the "бюджет vs факт" cards render with a target
  // instead of the "додай план" empty-state.
  writeJSON(FINYK_MONTHLY_PLAN_KEY, { income: 45000, expense: 28000 });

  // Skip the Monobank-login gate so Finyk renders its full UI.
  writeRaw(FINYK_MANUAL_ONLY_KEY, "1");
}
