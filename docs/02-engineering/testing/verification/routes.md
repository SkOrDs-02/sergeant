# Матриця маршрутів для повторної перевірки

> **Last validated:** 2026-09-05 by Codex. **Next review:** 2026-12-05.
> **Status:** Active

Матриця фіксує адреси, а не результати. Перед прогоном звір її з `router.tsx`, `StandaloneRoutes.tsx` і парсерами модулів; новий маршрут без сценарію `JRN-route-contract` є прогалиною покриття.

| Поверхня       | Канонічні адреси                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hub            | `/`, `/?tab=dashboard`, `/?tab=reports`, `/?tab=profile`, `/?tab=settings`                                                                                                                                                                                          |
| Public/auth    | `/welcome`, `/sign-in`, `/reset-password`, `/verify-email`, `/pricing`, `/status`, `/assistant`, `/capabilities`                                                                                                                                                    |
| Service/legal  | `/offline`, `/500`, `/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/offer`                                                                                                                                                                              |
| Finyk          | `/finyk`, `/finyk/transactions`, `/finyk/budgets`, `/finyk/analytics`, `/finyk/assets`                                                                                                                                                                              |
| Nutrition      | `/nutrition`, `/nutrition/pantry`, `/nutrition/pantry/items`, `/nutrition/pantry/shopping`, `/nutrition/log`, `/nutrition/menu`, `/nutrition/menu/plan`, `/nutrition/menu/recipes`                                                                                  |
| Routine        | `/routine`, `/routine/habits`, `/routine/stats`                                                                                                                                                                                                                     |
| Fizruk         | `/fizruk`, `/fizruk/atlas`, `/fizruk/atlas/:muscleId`, `/fizruk/workouts`, `/fizruk/workout/:id`, `/fizruk/history`, `/fizruk/catalog`, `/fizruk/templates`, `/fizruk/programs`, `/fizruk/progress`, `/fizruk/measurements`, `/fizruk/body`, `/fizruk/exercise/:id` |
| Core redirects | `/settings/*` → `/?tab=settings`; `/insights/*` → `/?tab=reports`; `/onboarding/*` owns onboarding flow                                                                                                                                                             |

Сумісність перевіряється окремо: `/login`, `/signin`, `/auth` → `/sign-in`; старі hash-адреси чотирьох модулів переписуються у path-based URL зі збереженням підтримуваних query; Finyk `payments` → `budgets`; Nutrition `products`/`shop` → `pantry`, `plan`/`recipes` → `menu`. `/routine/today` трапляється у старих insight-посиланнях, але поточний парсер повертає календар; це compatibility probe, не четверта сторінка Routine.

Для кожної канонічної адреси у full-прогоні потрібні: пряме відкриття, reload, назад/вперед, очікуваний title і heading, auth/paywall стан, відсутність неочікуваних console/page errors і 4xx/5xx, а також screenshot 390×844 та 1280×800. Невідомий шлях має показати контрольований 404; невідомий підшлях модуля має виконати задокументований fallback, не білий екран.
