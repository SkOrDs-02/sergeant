---
name: sergeant-hubchat
description: DEPRECATED — merged into sergeant-module-ai; load .agents/skills/sergeant-module-ai/SKILL.md for HubChat tools, executors, prompt cache, action cards; UA: HubChat тепер у sergeant-module-ai.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# HubChat → sergeant-module-ai

> **Status:** Deprecated (Rule #10). Цей скіл поглинуто модульним owner-скілом AI-шару — уся механіка HubChat (визначення інструментів, виконавці, кеш промптів, картки дій) тепер живе у [`sergeant-module-ai`](../sergeant-module-ai/SKILL.md).

- Новий дім механіки: `.agents/skills/sergeant-module-ai/SKILL.md` — читай його замість цього файла.
- Запис про деприкацію — у каталозі: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md) (§ Deprecated → Replacement).
- Не додавай сюди нових правил: файл лишається лише вказівником, щоб старі посилання не ламались.
