# Renovate — як працювати з PR-ами

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active
>
> Створено 2026-04-25 разом з [#721](https://github.com/Skords-01/Sergeant/pull/721). Конфіг: `renovate.json` у корені.

## TL;DR

1. **Понеділок ранок** → подивись список нових PR від `renovate[bot]`.
2. **CI зелений + diff виглядає sane** → merge.
3. **Dev-only patch** → нічого не роби, замерджиться сам.
4. **Major (6.x → 7.x)** → читаєш changelog у тілі PR, тестуєш локально, merge або close.

Більше нічого не треба.

## Настройка одноразова

1. Постав GitHub-додаток **Mend Renovate** на акаунт `Skords-01`: <https://github.com/apps/renovate>.
2. У dashboard <https://developer.mend.io/> переключи **Default Engine Settings → Dependency Updates** з `Silent` на **`Auto`** (інакше PR-ів не буде).
3. Перевір що Sergeant є в **Installed Repositories**. Якщо ні — додай через Settings.
4. Чекай ~10-30 хв → Renovate створить **онбординг-PR** з тайтлом `Configure Renovate`. Замерджай. Це підтверджує `renovate.json`.

Після цього все автоматично.

## Що приходитиме

### Окремі PR-и

Тайтл: `chore(deps): update <package> to v<version>`

Розклад: **щопонеділка до 6:00 за Києвом**, max 30 одночасних, max 2 на годину.

Згруповані за екосистемами (один PR на групу, не один на кожен пакет):

- `eslint` — eslint, eslint-\*, @typescript-eslint/\*, @eslint/\*
- `vitest` — vitest, @vitest/\*
- `vite` — vite, @vitejs/\*, vite-\*
- `playwright` — @playwright/\*, playwright
- `tanstack` — @tanstack/\*
- `radix-ui` — @radix-ui/\*
- `expo sdk` — expo, expo-\*, @expo/\* (pinned, бо ламається)
- `capacitor` — @capacitor/\*
- `react-native` — react-native, react-native-\* (pinned)
- `turborepo` — turbo
- `type definitions` — @types/\*
- `github-actions` — всі actions, пінятся до commit SHA

### Dependency Dashboard

Один **GitHub Issue** з тайтлом `Dependency Dashboard`. Створиться при першому запуску і буде оновлюватись.

Що там:

- Всі pending updates з чекбоксами — можна руками тригернути PR не чекаючи понеділка.
- Список того що Renovate ігнорує і чому.
- Errors якщо щось зламалось.

Прибагмаркай це Issue.

### Security PR-и

Тайтл містить лейбл `security`. Створюються **миттєво**, поза розкладом, без min-release-age.

Пріоритет: **завжди перший**. Дивись changelog → merge.

### Lockfile maintenance PR

Тайтл: `chore(deps): refresh pnpm-lock.yaml`. Раз на тиждень. Автоматично перегенерує lockfile щоб підтягнути secondary updates у транзитивних деплях.

Безпечно мерджити після зеленого CI.

## Що merge-аю автоматично (не треба робити нічого)

- **Dev-only patch / pin / digest** оновлення → автомердж після зеленого CI.
- Стратегія — **GitHub Auto-merge на PR** (`automergeType: "pr"` + `platformAutomerge: true`). Renovate створює PR, ставить його в auto-merge, GitHub сам мерджить коли всі required checks зеленіли.
- Передумова на стороні репо: у **Settings → General → Pull Requests** має бути увімкнений **"Allow auto-merge"**. Без цього GitHub auto-merge не запуститься, PR-и просто залишаться відкритими.

Це означає що `@types/node 20.10.5 → 20.10.6` або `eslint 9.15.0 → 9.15.1` не вимагатимуть твоєї уваги.

## Що **не** автомерджу — потрібне ручне ревʼю

- Будь-який major (`vitest 3.x → 4.x`).
- Будь-який minor (`react 19.0.0 → 19.1.0`).
- Будь-яка production-залежність (не `devDependencies`) — навіть patch.
- Будь-який security PR (свідоме рішення).

## Як ревʼюїти

### Швидкий cheatsheet

1. **Відкриваєш PR**.
2. **Дивишся "Files changed"**: має бути тільки `package.json` + `pnpm-lock.yaml`. Якщо є щось інше — це не Renovate-PR, обережно.
3. **Читаєш "Release Notes" розділ** (Renovate сам клеїть changelog у body PR-а):
   - Є **Breaking changes**? Якщо так — або відкладай, або тестуй вручну.
   - Є тільки bug fixes / docs? → merge.
4. **Чекаєш зеленого CI** (Smoke E2E + Test coverage + check).
5. **Merge** (squash, як завжди).

### Коли червоний CI

Це часто означає:

- API залежності змінилось (breaking) — почитай error в логах CI.
- Або тип посилився і знайшов реальну проблему в нашому коді.

Опції:

- Закрити PR (Renovate знову створить його через тиждень або при наступному релізі — змусить розібратись).
- Попросити AI-сесію (нову Devin) пофіксити код у тій же гілці.
- Додати правило в `renovate.json`: `"matchPackageNames": ["X"], "enabled": false` — і Renovate більше не пробуватиме.

### Як заборонити апдейт пакета

`renovate.json` → `packageRules` → новий запис:

```jsonc
{
  "description": "Залишаємось на старій версії бо ...",
  "matchPackageNames": ["package-name"],
  "enabled": false,
}
```

Або пін на конкретну major-версію:

```jsonc
{
  "matchPackageNames": ["package-name"],
  "allowedVersions": "<5.0.0",
}
```

## Розклад і timing

| Подія                | Коли                          |
| -------------------- | ----------------------------- |
| Звичайні PR          | Mon 00:00–06:00 Europe/Kyiv   |
| Security PR          | негайно, поза розкладом       |
| Lockfile maintenance | Mon ранок                     |
| Dependency Dashboard | оновлюється при кожному скані |
| Скан репо            | приблизно раз на годину       |
| Concurrent PRs       | max 30                        |
| PRs per hour         | max 2                         |

Якщо хочеш на тиждень "тихо" — закрий усі PR без merge, наступного понеділка прийдуть нові.

## Faq

**Q: Renovate не створює PR-и.**

- Перевір що в Mend dashboard режим **`Auto`**, не `Silent`.
- Перевір що Sergeant є в Installed Repositories.
- Подивись Dependency Dashboard Issue — там може бути зазначено помилку конфігу.

**Q: Я закрив PR — він прийде знову?**

- Так, при наступному скані того ж пакета (зазвичай при наступному релізі або через тиждень). Якщо хочеш заборонити навсегда — додай `enabled: false` правило.

**Q: Renovate створив 50 PR-ів одразу.**

- При першому запуску — нормально, він проходить весь беклог. Подальше — обмежено `prHourlyLimit2` + `prConcurrentLimit: 30`. Якщо все одно багато — запини що тобі найважливіше, решта почекає.

**Q: Чи бачить Renovate приватні дані?**

- Renovate бачить `package.json` + lockfiles + дозвіл писати в репо. Не бачить твій код за межами цих файлів. Mend (хост) не бачить нічого окрім метаданих.

**Q: Як зробити dry-run перед merge-ом онбордингу?**

```sh
LOG_LEVEL=debug npx --package=renovate renovate \
  --platform=local --dry-run=full
```

Покаже що Renovate планує зробити без будь-яких реальних PR.

## Зв'язки

- `renovate.json` — сам конфіг
- `docs/planning/dev-stack-roadmap.md` #7 — навіщо ми це робили
- AGENTS.md hard rule #5 — конвенціональні commit-меседжі (Renovate їх дотримується через `:semanticCommitTypeAll(chore)` + `:semanticCommitScope(deps)`)
