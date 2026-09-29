/**
 * Last validated: 2026-09-26
 * Status: Active
 *
 * Сторож зовнішнього стирання OPFS під живою вкладкою.
 *
 * AI-CONTEXT: «Очистити дані сайту» (налаштування Chrome, попап біля
 * адресного рядка, CDP `Storage.clearDataForOrigin`) видаляє теку пулу
 * одразу, навіть коли воркер тримає її файли відкритими. Вкладка цього не
 * помічає: записи далі йдуть у вже видалені файли, видимі на екрані, і
 * зникають на першому ж перезавантаженні чи падінні рендерера. Саме так
 * сліпий замір 2026-09-26 втратив увесь датасет (F2). Перевірити теку
 * дешево, а перезавантаження - єдиний чесний вихід: людина сама стерла
 * дані, і застосунок має почати з порожнього, але живого сховища.
 */

let installed = false;

/** Чи існує тека в OPFS. Лише `NotFoundError` означає «стерто». */
export async function opfsDirectoryExists(directory: string): Promise<boolean> {
  try {
    let dir = await navigator.storage.getDirectory();
    for (const part of directory.split("/").filter(Boolean)) {
      dir = await dir.getDirectoryHandle(part);
    }
    return true;
  } catch (err) {
    return !(err instanceof DOMException && err.name === "NotFoundError");
  }
}

/**
 * Перевіряє теку, коли вкладка повертається до людини: з налаштувань
 * (`visibilitychange`) або з попапу сайту (`focus`).
 */
export function watchOpfsWipe(
  directory: string,
  onWiped: () => void = () => window.location.reload(),
): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const check = () => {
    if (document.visibilityState !== "visible") return;
    void opfsDirectoryExists(directory).then((exists) => {
      if (!exists) onWiped();
    });
  };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("focus", check);
}

export function __resetOpfsWipeGuardForTests(): void {
  installed = false;
}
