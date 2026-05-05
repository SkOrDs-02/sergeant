---
name: sergeant-bugfix-and-regression
description: Use when fixing a Sergeant bug, regression, flaky test, broken deploy, or production issue where the fix depends on reproducing the failure first; UA: фіксиш баг, регресію, флакі-тест.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Bugfix і регресії в Sergeant

Не патч баг наосліп. Відтвори, ізолюй, додай failing-перевірку, потім виливай найменший фікс, що запобігає повторенню.

## Обовʼязкова послідовність

1. Зафіксуй failing-поведінку: тест, лог, скриншот, curl-виклик або точний шлях відтворення.
2. Визнач поверхню-власника і завантаж її Sergeant-skill.
3. Додай failing-тест або відтворюваний verification-крок перш ніж змінювати поведінку.
4. Імплементуй мінімальний фікс.
5. Перепрогон оригінального failure і ще однієї сусідньої regression-перевірки.

## Прийнятні артефакти відтворення

- Vitest/Jest-тест
- контракт-тест для API-форми
- вивід команди міграції
- `curl`-відтворення для server- або HubChat-flows
- нотатки відтворення для браузера/мобільного, коли автоматизованого покриття ще немає

## Червоні прапорці

- «Баг очевидний, швидко запатчу»
- «Додам тести після фіксу»
- «Не можу відтворити, але знаю, який рядок»

Якщо чуєш такі думки — стоп, спершу відтвори.

## Куди роутити далі

- флакі або зламана UI-state → `sergeant-web-ui`
- регресія серіалізатора чи роута → `sergeant-server-api`
- schema- або deploy-крах → `sergeant-data-and-migrations`
- mobile-only поведінка → `sergeant-mobile-expo`
- chat-tool fail → `sergeant-hubchat`

## Playbooks

- `docs/playbooks/hotfix-prod-regression.md` — triage і фікс production-регресій.
- `docs/playbooks/declare-incident.md` — коли баг доростає до рівня інциденту.
- `docs/playbooks/write-postmortem.md` — postmortem постфактум.
- Каталог: `docs/agents/agent-skills-catalog.md`.
