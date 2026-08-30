/**
 * Таблиця «що бачить токен Monobank» – спільна для гайда Monobank і
 * сторінки «Твої дані», щоб факти про доступ жили в одному місці.
 */
const ACCESS_TABLE = [
  { data: "Суми і час транзакцій", access: "Бачить", ok: true },
  { data: "Категорія покупки (MCC)", access: "Бачить", ok: true },
  { data: "Баланс рахунку", access: "Бачить", ok: true },
  { data: "Повний номер картки, CVV", access: "Не бачить", ok: false },
  {
    data: "Перекази, платежі, будь-який рух грошей",
    access: "Не може",
    ok: false,
  },
];

export default function MonoAccessTable() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_130px]">
      <span className="border-b border-cardline-strong py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        Дані
      </span>
      <span className="border-b border-cardline-strong py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        Доступ
      </span>
      {ACCESS_TABLE.map((row) => (
        <div key={row.data} className="contents">
          <span className="border-b border-cardline py-3.5 text-sm text-foreground">
            {row.data}
          </span>
          <span
            className={`border-b border-cardline py-3.5 text-sm font-bold ${
              row.ok ? "text-accent" : "text-danger"
            }`}
          >
            {row.access}
          </span>
        </div>
      ))}
    </div>
  );
}
