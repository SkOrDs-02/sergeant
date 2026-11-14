import { toKyivISODate } from "@sergeant/shared";

/**
 * Розраховує скільки потрібно відкладати щомісяця для досягнення цілі.
 * @returns {{ monthlyNeeded: number|null, monthsLeft: number, isAchieved: boolean, isOverdue: boolean }}
 */
export function calcMonthlyNeeded(
  targetAmount: number | string | null | undefined,
  savedAmount: number | string | null | undefined,
  targetDate: string | Date | null | undefined,
  now: Date = new Date(),
): {
  monthlyNeeded: number | null;
  monthsLeft: number | null;
  isAchieved: boolean;
  isOverdue: boolean;
} {
  const tgt = Number(targetAmount) || 0;
  const saved = Number(savedAmount) || 0;

  if (saved >= tgt && tgt > 0) {
    return {
      monthlyNeeded: null,
      monthsLeft: 0,
      isAchieved: true,
      isOverdue: false,
    };
  }

  if (!targetDate) {
    return {
      monthlyNeeded: null,
      monthsLeft: null,
      isAchieved: false,
      isOverdue: false,
    };
  }

  // Дедлайн цілі - фінансова дата, тож «сьогодні» київське, а не UTC.
  const [y1, mm1, d1] = toKyivISODate(now).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const m1 = mm1 - 1;

  const target = (() => {
    const s = String(targetDate || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-").map(Number);
      // Regex `^\d{4}-\d{2}-\d{2}$` гарантує, що `y/m/d` є числами,
      // але під strict noUncheckedIndexedAccess TS не виводить це з
      // `String.split` — `?? 0` тут чисто для типового задоволення.
      return new Date(Date.UTC(y ?? 0, (m || 1) - 1, d || 1, 12, 0, 0, 0));
    }
    const dt = new Date(targetDate);
    return new Date(
      Date.UTC(
        dt.getUTCFullYear(),
        dt.getUTCMonth(),
        dt.getUTCDate(),
        12,
        0,
        0,
        0,
      ),
    );
  })();

  const nowMiddayUtc = new Date(Date.UTC(y1, m1, d1, 12, 0, 0, 0));
  // День дедлайну ще триває: прострочено лише з наступного дня.
  if (target < nowMiddayUtc) {
    return {
      monthlyNeeded: null,
      monthsLeft: 0,
      isAchieved: false,
      isOverdue: true,
    };
  }

  const y2 = target.getUTCFullYear(),
    m2 = target.getUTCMonth();
  let monthsLeft = (y2 - y1) * 12 + (m2 - m1);
  const sameMonthsLater = new Date(
    Date.UTC(y1, m1 + monthsLeft, d1, 12, 0, 0, 0),
  );
  if (target > sameMonthsLater) monthsLeft += 1;
  monthsLeft = Math.max(1, monthsLeft);
  const remaining = Math.max(0, tgt - saved);
  const monthlyNeeded = Math.ceil(remaining / monthsLeft);

  return { monthlyNeeded, monthsLeft, isAchieved: false, isOverdue: false };
}
