// Українська плюралізація — три форми за правилами CLDR.
//
// Приклад: день/дні/днів, година/години/годин.
//   one (n mod 10 == 1, n mod 100 != 11) → "день"
//   few (n mod 10 in 2..4, n mod 100 not in 12..14) → "дні"
//   many (все інше, вкл. 0) → "днів"
//
// Перенесено з intl-плаг: залежностей не додаємо, бо потрібні лише лічильники
// без локалей, а intl.PluralRules не дасть саму форму слова.

export type UaPluralForms = {
  one: string;
  few: string;
  many: string;
};

export function pluralUa(n: number, forms: UaPluralForms): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms.many;
  const mod10 = abs % 10;
  if (mod10 === 1) return forms.one;
  if (mod10 >= 2 && mod10 <= 4) return forms.few;
  return forms.many;
}

const DAYS_FORMS: UaPluralForms = { one: "день", few: "дні", many: "днів" };

export function pluralDays(n: number): string {
  return pluralUa(n, DAYS_FORMS);
}

const TIMES_FORMS: UaPluralForms = { one: "раз", few: "рази", many: "разів" };

export function pluralTimes(n: number): string {
  return pluralUa(n, TIMES_FORMS);
}
