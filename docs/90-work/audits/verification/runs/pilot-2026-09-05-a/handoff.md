# Передача прогону

> **Status:** Archived

- Виконано: live signup, витрата 12345 minor units, reload; clean-device pull відтворив дефект.
- Стан акаунтів і seed: `pilot-disposable-a`, `pilot-expense-12345-v1`; credentials/state лише в `E:/Temp/sergeant-verification-20260905/first/`.
- Блокери та докази: CALC/AI/experience не завершені через fail-fast першої версії пілотного скрипта. SYNC fail: після push context B не отримав запис; trace і result доступні за зовнішніми шляхами у run.json.
- Наступна точна команда/крок: дивитись повтор `pilot-2026-09-05-b`; для діагностики sync зіставити pushed op owner/cursor з pull user/cursor.
- Нюанси й невдалі підходи: `waitForSyncQuiet()` може пройти, коли banner ще не зʼявився; потрібен барʼєр успішної відповіді `/api/v2/sync/push`. Playwright bundled Chromium був відсутній, використано системний Chrome.
