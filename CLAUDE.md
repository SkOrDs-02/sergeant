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

## Claude-specific нотатки

- Для browser smoke tests віддавай перевагу локальному / in-app browser workflow.
- Не дублюй repo policy у відповіді, якщо вона вже описана в `AGENTS.md` або playbook — посилайся.
- Для review/merge tasks звіряйся з [docs/governance/review-checklist.md](./docs/governance/review-checklist.md).
- **OpenClaw Gateway:** якщо задача торкається Telegram-бота, console agent або `@sergeant/openclaw-plugin` — завантажуй `sergeant-openclaw` скіл (не `sergeant-hubchat`). Дивись [docs/adr/0055-openclaw-external-gateway.md](./docs/adr/0055-openclaw-external-gateway.md).
- **Перед будь-якою зміною SKILL.md** — прочитай `sergeant-writing-skills` скіл. Після змін обов'язково: `pnpm lint:skills && pnpm skills:lock`. CI падає без оновленого lock.
- **ADR directory:** `docs/adr/` містить 23+ ADR-ів (останній — 0057, 2026-05-11). Читай перед зміною infrastructure, auth або billing.
- **TypeScript:** `noUncheckedIndexedAccess: true` активний — враховуй при генерації коду з index-доступом до масивів/об'єктів.
