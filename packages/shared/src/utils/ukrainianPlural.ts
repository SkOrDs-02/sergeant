// Українська плюралізація — три форми за правилами CLDR.
//
// Приклад: день/дні/днів, година/години/годин.
//   one (n mod 10 == 1, n mod 100 != 11) → "день"
//   few (n mod 10 in 2..4, n mod 100 not in 12..14) → "дні"
//   many (все інше, вкл. 0) → "днів"
//
// Категорію рахує Intl.PluralRules("uk") (стандартна реалізація CLDR);
// саму форму слова (one/few/many) підставляє виклик — Intl не знає слів.

export type UaPluralForms = {
  one: string;
  few: string;
  many: string;
};

const UA_PLURAL_RULES = new Intl.PluralRules("uk");

export function pluralUa(n: number, forms: UaPluralForms): string {
  const category = UA_PLURAL_RULES.select(Math.abs(Math.trunc(n)));
  if (category === "one") return forms.one;
  if (category === "few") return forms.few;
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

const EXERCISES_FORMS: UaPluralForms = {
  one: "вправа",
  few: "вправи",
  many: "вправ",
};

export function pluralExercises(n: number): string {
  return pluralUa(n, EXERCISES_FORMS);
}

const HABITS_FORMS: UaPluralForms = {
  one: "звичка",
  few: "звички",
  many: "звичок",
};

export function pluralHabits(n: number): string {
  return pluralUa(n, HABITS_FORMS);
}
