# Codemod — strip `.js` / `.jsx` from first-party imports

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Completed & archived (one-time codemod; do not run again outside investigation)

## What it did

Видаляв `.js` / `.jsx` розширення з first-party імпортів у `.ts` / `.tsx` файлах під `apps/web/src`. Торкався тільки шляхів, що починаються з:

- `.` (relative imports)
- `@shared/`, `@finyk/`, `@fizruk/`, `@routine/`, `@nutrition/`, `@sergeant/` (path-aliased imports)

Зовнішні пакети (наприклад, `@zxing/browser/esm/.../foo.js`) свідомо **не** чіпались — їхні subpath-імпорти можуть вимагати реальної `.js`.

## When it ran

Одноразово. Виконано до того, як цей файл переїхав у `scripts/codemods/`. Виконувалось у режимі `--write` після `--dry-run` валідації:

```bash
node scripts/strip-js-extensions.mjs            # dry run summary (стара локація)
node scripts/strip-js-extensions.mjs --write    # apply in-place
```

Результат: 436 first-party-імпортів у 180 файлах перероблено.

## Why it lives here (and not in scripts/ root)

Codemods — це **одноразові міграційні інструменти**, не CI tooling. Вони не дзвоняться з `package.json` чи з GitHub Actions. Тримання їх поряд із operational scripts (`check-*`, `lint-*`, `generate-*`) розмиває межу "що з цього бажано видалити після виконання". `scripts/codemods/<name>/` чітко сигналізує: «це історичний artefact; зберігається на випадок forensics або re-run на окремому файловому дереві».

Конвенція тут — це **не** Hard Rule, а acceptable practice, виявлена в [`docs/audits/2026-05-02-doc-hygiene-audit.md`](../../../docs/audits/2026-05-02-doc-hygiene-audit.md) §3.

## Idempotency

Codemod ідемпотентний: повторний запуск на чистому дереві дасть `would rewrite 0 import(s)`. Якщо побачиш ненульове число при re-run — це сигнал, що або з'явився новий `.js` / `.jsx` імпорт у first-party коді (значить, ESLint guard зламано — див. нижче), або хтось revert-нув кодомод у частковому обсязі.

## Long-term enforcement

Після того, як codemod виконано один раз, дотримання забезпечує ESLint:

- `eslint-plugin-import@^2.32.0` + `import/extensions: never` для bundler-fed apps (`apps/web`, `apps/mobile`).
- Allowlist для зовнішніх `@zxing/*` subpath-імпортів.
- Запроваджено в [PR #1411](https://github.com/Skords-01/Sergeant/pull/1411).

Це означає: якщо новий код реінтродукує `.js` extension у first-party imports, він не пройде через `pnpm lint`. Codemod більше не повинен бути потрібним.

## Re-running on a stale fork / branch

Якщо комусь треба прогнати codemod на старій гілці, де імпорти ще з `.js`-розширеннями, виконати:

```bash
node scripts/codemods/strip-js-extensions/script.mjs            # dry run
node scripts/codemods/strip-js-extensions/script.mjs --write    # apply
```

Скрипт self-contained — не залежить від інших файлів у `scripts/`.

## Related

- [`docs/tech-debt/frontend.md` § 3](../../../docs/tech-debt/frontend.md) — historical context (виконану секцію позначено strikethrough).
- [`docs/audits/2026-05-02-doc-hygiene-audit.md` §3](../../../docs/audits/2026-05-02-doc-hygiene-audit.md) — пропозиція винести codemods у `scripts/codemods/` (закрито цим PR).
