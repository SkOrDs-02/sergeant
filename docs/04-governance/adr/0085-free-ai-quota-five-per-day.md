# ADR-0085: Free AI quota — п’ять добових одиниць

- **Status:** Accepted
- **Last validated:** 2026-09-04 by Codex (звірка графа коду й джерел). **Next review:** 2026-12-03.
- **Date:** 2026-08-06
- **Deciders:** @SkOrDs-02
- **Supersedes:** —
- **Related:**
  - [`apps/server/src/modules/billing/effectiveLimits.ts`](../../../apps/server/src/modules/billing/effectiveLimits.ts)
  - [`apps/server/src/modules/chat/aiQuota.ts`](../../../apps/server/src/modules/chat/aiQuota.ts)
  - [ADR-0086](./0086-no-anonymous-ai-sign-in-required.md)
  - [Канон AI-шару](../../01-product/model/hub-coach.md)

## Контекст

Попередній pricing record документував більшу Free allowance, ніж використовував
продукт і код. Це рішення фіксує paid entitlement у виміряному cost-safe
значенні; число живе в `effectiveLimits`, а не в route constants чи deployment
environment variables.

## Рішення

| План | `aiRequestsPerDay`  |
| ---- | ------------------- |
| Free | **5**               |
| Pro  | `null` (без ліміту) |

`assertAiQuota()` резолвить план автентифікованого користувача та списує
спільну денну квоту. За помилки plan lookup він застосовує Free limit, а не
видає безліміт. `AI_DAILY_USER_LIMIT` парситься для сумісності, але не є
джерелом істини entitlement.

Автентифіковані AI paths, що монтують денну квоту, ділять це plan-based budget.
Weekly digest навмисно поза цією квотою; його не можна описувати споживачем без
відповідної зміни router-а. Preset budgets, коли змонтовані, лишаються окремими
budget-ами, а не прихованою зміною five-unit entitlement.

## Межа анонімного доступу

Історичний рядок «анонім, IP-keyed, один на добу» не активний. Він став
недосяжним, коли AI routes вимагали сесію, і прибраний ADR-0086. Не можна
повертати anonymous limit, `AI_DAILY_ANON_LIMIT` чи IP identity branch як малу
quota-правку: анонімний AI потребує окремого схваленого дизайну.

## Наслідки

- Free і Pro limits мають одне executable source у `effectiveLimits`.
- Tool round trip обліковується protected route/ticket flow; callers не
  можуть вигадувати власну інтерпретацію accounting.
- `AI_QUOTA_DISABLED` лишається development/test escape hatch і блокується на
  production startup. Це не operational спосіб змінити план.
