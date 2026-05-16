---
name: sergeant-council
description: Use when the founder needs a multi-perspective advisory board — spawns council specialists in parallel (product, ux, growth, tech, critic) and synthesizes recommendations; UA: скликай раду / порадься з командою.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Рада директорів Sergeant

Цей skill скликає динамічну раду спеціалістів, які аналізують питання паралельно і дають синтезовану рекомендацію з різних точок зору.

## Коли завантажувати

Завантажуй коли засновник:
- Губиться і не знає що робити далі
- Хоче перевірити чи правильно розуміє або впроваджує щось
- Потребує кількох незалежних точок зору на ідею, рішення або проблему
- Каже: «скликай раду», «порадься з командою», «що думаєш про ідею», «не знаю що робити»

**Не завантажуй** для простих технічних задач — там достатньо відповідного specialist skill.

## Склад ради (динамічний)

Визначай склад на основі типу питання:

```
Стратегія / напрямок / «що робити»   → product + ux + growth + critic
Технічне / реалізація / «як зробити» → tech + product + critic (+ ux якщо є UI)
Маркетинг / зріст / просування       → growth + ux + product + critic
UX / юзер-досвід / зручність         → ux + product + critic
Загальне «гублюсь» / без теми        → всі 5 спеціалістів
```

## Спеціалісти

| Субагент | Роль | Фокус |
|---|---|---|
| `council-product-strategist` | Product Manager | Цінність для юзера, пріоритети, фокус |
| `council-ux-advocate` | UX Designer | Простота, friction, зрозумілість |
| `council-growth-advisor` | Growth Strategist | Залучення, утримання, позиціонування |
| `council-tech-architect` | Tech Lead | Реалістичність, ризики, простота рішення |
| `council-critic` | Devil's Advocate | Blind spots, припущення, альтернативи |

## Як запустити

```
Create an agent team to advise on: [опис ситуації/питання]
Spawn [N] teammates based on the question type:
1. council-product-strategist — оцінює продуктову цінність і пріоритети
2. council-ux-advocate — оцінює зручність для юзера
[3. council-growth-advisor — якщо питання про ріст/маркетинг]
[4. council-tech-architect — якщо є технічний аспект]
5. council-critic — шукає blind spots і ризики

Context for all: [вставити опис ситуації/ідеї/проблеми від засновника]

Ask each specialist to send their perspective to the lead when done.
```

## Synthesis формат

Після отримання всіх звітів від спеціалістів, виводь у такому форматі:

```markdown
## Рада зібралась щодо: [тема]

### Голоси ради

**🎯 Product Strategist:** [1-2 речення]
**👤 UX Advocate:** [1-2 речення]
**📈 Growth Advisor:** [1-2 речення — якщо викликано]
**⚙️ Tech Architect:** [1-2 речення — якщо викликано]
**🔴 Critic:** [1-2 речення — червоні прапори]

### Консенсус
[На чому всі сходяться / головний висновок]

### Рекомендація — 3 конкретні кроки
1. ...
2. ...
3. ...

### Питання до тебе
- [Що потрібно вирішити перед рухом вперед]
```

## Червоні прапори

- «Запущу всіх 5 на просте технічне питання» → перевантаження; обирай 3 релевантних
- «Synthesis до того як усі відзвітували» → неповна картина; чекай всіх
- «Рада не знає контексту Sergeant» → завжди передавай опис ситуації у prompt кожного спеціаліста

## Playbooks

- [`docs/playbooks/run-council.md`](../../../docs/playbooks/run-council.md) — step-by-step рецепт
- [`docs/agents/agent-skills-catalog.md`](../../../docs/agents/agent-skills-catalog.md) — каталог всіх skills
