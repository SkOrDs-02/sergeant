/**
 * Пін на те, що порожній стан чату лишається ДОСЯЖНИМ.
 *
 * `ChatEmpty` (чотири suggestion-чіпи по модулях) рендериться лише при
 * `messages.length === 0`. Доки `normalizeStoredMessages` підставляла
 * привітальну репліку в порожній масив, така умова не наставала НІКОЛИ —
 * усі чотири шляхи до `messages` (нова сесія, розбір збереженої, читання
 * списку сесій, холодний старт хука) ідуть через цю функцію.
 *
 * Той самий дефект виправлено у вебі знахідкою PR-A7. На мобайлі він дожив
 * довше, бо копія логіки не отримує виправлень оригіналу (знахідка PR-X5).
 * Тому пін стоїть тут, а не лише у вебі.
 */
import { normalizeStoredMessages } from "./hubChatUtils";

describe("normalizeStoredMessages", () => {
  it("порожній вхід дає порожній масив, а не привітання", () => {
    expect(normalizeStoredMessages(null)).toEqual([]);
    expect(normalizeStoredMessages(undefined)).toEqual([]);
    expect(normalizeStoredMessages([])).toEqual([]);
    expect(normalizeStoredMessages("не масив")).toEqual([]);
  });

  it("непорожній масив мапиться без змін по суті", () => {
    // Зворотна сумісність: у сховищі людей уже лежать сесії, де давнє
    // привітання є ЄДИНИМ повідомленням. Воно мусить лишитись звичайним
    // persisted-повідомленням, а не зникнути разом із підстановкою.
    const stored = [
      { id: "m1", role: "assistant", text: "Привіт! Я Сержант." },
    ];
    const out = normalizeStoredMessages(stored);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "m1", text: "Привіт! Я Сержант." });
  });

  it("запису без id дописується id, а не губиться повідомлення", () => {
    const out = normalizeStoredMessages([{ role: "user", text: "гей" }]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBeTruthy();
    expect(out[0]?.text).toBe("гей");
  });
});
