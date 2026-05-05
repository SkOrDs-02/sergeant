# Codemods

> **Last validated:** 2026-05-05 by @Skords-01 / Devin. **Next review:** 2026-08-03.
> **Status:** Active

Одноразові міграційні скрипти, які запускались **один раз** у певному PR, виконали structural rewrite у репі і більше не потрібні в нормальному workflow. Зберігаються тут для:

- forensics (хтось ловить regression і хоче зрозуміти, як саме код перероблено);
- re-run на старій гілці чи fork-у, де rewrite ще не виконано;
- як reference-приклад при написанні наступного codemod-у.

**Це не CI tooling.** CI / lint скрипти живуть у `scripts/` root. Якщо цей README чи піддиректорія раптом потрапляє в `package.json` як `pnpm <task>` — це сигнал, що його треба переписати у звичайний script у `scripts/`, не в codemod.

## Layout

Кожен codemod — окрема піддиректорія з:

- `script.mjs` — сам кодомод (виконуваний `node` script).
- `README.md` — що робив, коли запускався, чому залишається тут, як re-run.

## Caталог

| Codemod                                          | Запущено      | Що робив                                                                                                                                                                                 | Long-term enforcement                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`strip-js-extensions/`](./strip-js-extensions/) | до 2026-05-03 | Видалив `.js` / `.jsx` з 436 first-party-імпортів у 180 файлах під `apps/web/src`                                                                                                        | `eslint-plugin-import` + `import/extensions: never` (PR #1411)                                                                                                                                                          |
| [`syncedKV/`](./syncedKV/)                       | 2026-05-03    | Перевів `safeWriteLS(<sync-tracked key>, …)` на `safeWriteSyncedLS(…)` після видалення `localStorage.setItem` monkey-patch (PR #008 — `refactor(web): replace … with useSyncedKVStore`). | Dry-run codemod-as-CI-drift-check (exit 1 якщо знайдено новий call-site `safeWriteLS` зі sync-tracked ключем) + planned AST ESLint guard у PR #013. Скрипт сам несе `// @deprecated` маркер для `pnpm dead-code:files`. |

## Adding a new codemod

1. Створи піддиректорію `scripts/codemods/<descriptive-name>/`.
2. Поклади `script.mjs` усередину (стиль — як у решти `scripts/*.mjs`: shebang, top-of-file коментар з призначенням, dry-run за замовчанням, явний `--write` для застосування).
3. Поклади `README.md`, дотримуючись формату existing codemod-ів: «що робив», «коли запускався», «idempotency note», «long-term enforcement» (як забезпечується, що drift не повернеться).
4. Зареєструй у каталозі вище.
5. Якщо drift, який цей codemod виправляє, можна спіймати через ESLint / Hard Rule / CI script — додай його в тому ж PR. Codemod без long-term enforcement = регресія через 6 місяців.
