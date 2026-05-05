---
name: sergeant-review-and-merge
description: Use when reviewing a Sergeant PR, preparing for merge, checking commit scope, validating docs freshness, or deciding if a change is safe to ship; UA: ревʼю PR і мердж.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Ревʼю і мердж у Sergeant

Спершу — production-safety, потім — поліровка. Ревʼю в Sergeant не вважається завершеним, поки governance-ризики репо не перевірені поряд з якістю коду.

## Чекліст ревʼю

- Для зачепленої поверхні застосовано правильний specialist skill
- Тести покривають змінену поведінку, а не лише деталі імплементації
- Зміни API-форми йшли разом із `api-client` і тестами
- Migration safety явно обговорена, якщо змінювався SQL
- Доки оновлені лише там, де насправді змінився canonical doc
- Commit scope відповідає `AGENTS.md`
- Без `--no-verify`, без skip-hook-ів, без небезпечного порядку деплою

## Тригери merge-готовності

Звертай особливу увагу, коли diff торкається:

- `apps/server/src/migrations/**`
- `apps/server/src/modules/**` разом із `packages/api-client/**`
- `apps/web/src/shared/lib/api/queryKeys.ts`
- `apps/web/src/core/lib/hubChat*`
- auth-обвʼязки, env-доків або deploy-доків
- `.agents/**`, `docs/agents/**`, `.github/**`

## Пріоритети знахідок

- Ризик breakage або data loss
- Drift контракту або відсутнє покриття тестами
- Deploy- або rollback-небезпека
- Прогалини в доках, підтримуваності, ясності

## Playbooks

- `docs/playbooks/release.md` — canonical release-playbook (web + API, Capacitor shell, Expo) з decision-tree.
- `docs/playbooks/declare-incident.md` — ескалація, коли merge зламав прод.
- Каталог: `docs/agents/agent-skills-catalog.md`.
