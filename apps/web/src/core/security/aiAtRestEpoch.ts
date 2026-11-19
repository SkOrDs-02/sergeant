// Епоха стирання AI-слотів. Тривіальний модуль без залежностей: його можуть
// тягнути eager-шляхи (вихід, зміна особи), не підтягуючи сам aiAtRest.
let epoch = 0;

/** Кличеться при масовому стиранні сирих ключів поза слотами. */
export function bumpAtRestWipeEpoch(): void {
  epoch += 1;
}

export function getAtRestWipeEpoch(): number {
  return epoch;
}
