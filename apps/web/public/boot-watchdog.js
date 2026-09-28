/*
 * Сторож білого екрана.
 *
 * Зрідка (≈1 навігація на кількасот) статичні залежності entry-модуля
 * помирають з net::ERR_ABORTED, головний модуль не виконується, а #root
 * лишається порожнім назавжди. Винятку при цьому немає, тож chunkReload.ts
 * не спрацьовує. Ручний reload рятує щоразу (аудит 2026-08-05, B1; живі
 * повтори 2026-09-28 онлайн і офлайн). Причину на ізольованому стенді не
 * відтворено (0 з 280 навігацій), тож тут лікується симптом: один reload,
 * якщо через 8 с після load застосунок так і не змонтувався.
 *
 * Окремий файл, а не інлайн-скрипт: CSP має script-src 'self' без
 * 'unsafe-inline'. Мітка в sessionStorage не дає reload частіше ніж раз на
 * хвилину; без сховища reload не робимо зовсім, щоб не зациклитись.
 */
(function () {
  var KEY = "sergeant.boot_watchdog_at";
  var GRACE_MS = 8000;
  var COOLDOWN_MS = 60000;

  function check() {
    var root = document.getElementById("root");
    if (!root || root.childElementCount > 0) return;
    try {
      var last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < COOLDOWN_MS) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      return;
    }
    location.reload();
  }

  window.addEventListener("load", function () {
    setTimeout(check, GRACE_MS);
  });
})();
