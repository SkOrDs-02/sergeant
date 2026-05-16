# Claude in Sergeant

> **Last validated:** 2026-05-15 by @Skords-01. **Next review:** 2026-08-13.
> **Status:** Active

> **Single source of truth → [AGENTS.md](./AGENTS.md).** Цей файл — тонкий вказівник із кількома Claude-specific нотатками. Уся repo policy, hard rules, routing catalog і playbook-індекс живуть там і в `docs/`.

## Startup flow

1. Прочитай [AGENTS.md](./AGENTS.md).
2. Почни з `.agents/skills/sergeant-start-here/SKILL.md`.
3. Завантаж рівно один specialist skill для основної поверхні зміни.
4. Якщо під задачу є playbook у [docs/playbooks/](./docs/playbooks/README.md) — виконуй його як canonical recipe.
5. Перший раз у репо? Прогонись по [`docs/agents/onboarding.md`](./docs/agents/onboarding.md) — секрети, БД, hard-rule навігація, plop-генератори.

## Sub-agents — активне залучення

Не соромся запускати sub-agents. Це знижує час виконання та захищає головний контекст від зайвого шуму.

**Коли обов'язково спавнити агента:**
- Будь-яка пара незалежних задач (дослідження + реалізація, два модулі одночасно, multi-surface change) — запускай паралельно.
- Пошук по кодобазі > 3 grep-запитів → `Explore` agent.
- Планування архітектурних рішень → `Plan` agent.
- Ізольовані зміни в окремій гілці → `isolation: "worktree"`.

**Принцип:** якщо два кроки не залежать один від одного — вони мають іти паралельно через окремих агентів, а не послідовно в головному контексті.

**Типи агентів і їх призначення:**

| Тип | Коли використовувати |
|-----|----------------------|
| `Explore` | Пошук файлів, символів, патернів по кодобазі |
| `Plan` | Проєктування реалізації, вибір архітектурного підходу |
| `claude` | Складні multi-step задачі, що не вкладаються в інші типи |

## Local execution policy (slow hardware)

Цей ноутбук старий і повільний. Heavy команди вішають Claude Code на фоні. **За замовчуванням НЕ запускай локально:**

- ❌ `pnpm test` / `pnpm --filter ... test` — тестиганяє CI на push/PR.
- ❌ `pnpm lint` / `pnpm format` / `pnpm format:check` — CI auto-formats та лінтить.
- ❌ `pnpm check` — повний канонічний gate (format + lint + typecheck + test + build). Запускай лише коли користувач явно попросить pre-PR валідацію.
- ❌ `pnpm build` / `pnpm --filter ... build` — окрім випадку коли треба швидко перевірити compilation (тоді одна цілі, не повний моноріпо).
- ❌ `pnpm dev:*` — dev-сервери запускає користувач сам у своєму терміналі.

**Що МОЖНА і треба робити локально:**

- ✅ `pnpm typecheck` / `pnpm --filter ... typecheck` — швидко, ловить регресії типів після рефактору.
- ✅ `pnpm lint:skills && pnpm skills:lock` — обов'язково після зміни SKILL.md (CI падає без lock).
- ✅ Точкові команди генераторів (plop, codegen) під конкретну задачу.
- ✅ `git` операції.

**Виняток:** коли користувач явно каже "проженеш тести / лінт / check" — запускай. Підтвердження в одному turn не переноситься на наступні задачі.

**Перед звітом про виконання:** якщо ти НЕ запустив тест/лінт, скажи це прямо ("typecheck зелений, тести не ганяв — CI перевірить на push"). Не вдавай, що зміна повністю верифікована.

## Claude-specific нотатки

- Для browser smoke tests віддавай перевагу локальному / in-app browser workflow.
- Не дублюй repo policy у відповіді, якщо вона вже описана в `AGENTS.md` або playbook — посилайся.
- Для review/merge tasks звіряйся з [docs/governance/review-checklist.md](./docs/governance/review-checklist.md).
- **OpenClaw Gateway:** якщо задача торкається Telegram-бота, console agent або `@sergeant/openclaw-plugin` — завантажуй `sergeant-openclaw` скіл (не `sergeant-hubchat`). Дивись [docs/adr/0055-openclaw-external-gateway.md](./docs/adr/0055-openclaw-external-gateway.md).
- **Перед будь-якою зміною SKILL.md** — прочитай `sergeant-writing-skills` скіл. Після змін обов'язково: `pnpm lint:skills && pnpm skills:lock`. CI падає без оновленого lock.
- **ADR directory:** `docs/adr/` містить 23+ ADR-ів (останній — 0057, 2026-05-11). Читай перед зміною infrastructure, auth або billing.
- **TypeScript:** `noUncheckedIndexedAccess: true` активний — враховуй при генерації коду з index-доступом до масивів/об'єктів.
