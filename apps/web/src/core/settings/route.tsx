/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { Navigate, useLocation } from "react-router-dom";

/**
 * `/settings/*` — REDIRECT-only entry, більше НЕ самостійна оболонка.
 *
 * L-1 (profile/settings deep audit, 2026-08-08): до цього фіксу файл
 * рендерив `<main>` + `HubSettingsPage` як другу, окрему оболонку — без
 * хедера, без нижньої навігації, без `role="tabpanel"` (`HubBottomNav`
 * монтується лише з `HubHomeView`). `pb-28` (112px) резервував місце під
 * навігацію, якої на цьому маршруті не існувало — глухий кут, з якого
 * можна було вийти лише жестом браузера «назад». Рішення власника
 * (варіант «а», §0.1 аудиту): Налаштування живуть РІВНО в одному місці —
 * вкладці хаба (`?tab=settings`, `useHubUIState.readViewFromSearch`), з
 * усією її хромою. `/settings` лишається лише deep-link-адресою.
 *
 * Переносимо ВСІ query-параметри (додаючи до них `tab=settings`) і хеш
 * без винятків — інакше тихо ламається L-2: повернення з платіжного
 * порталу (`billing/stripe.ts`, `liqpay.ts`, `plata.ts`) читає саме
 * `?billing=portal-return|manage` на цьому URL, а `HubSettingsPage`
 * (`readBillingReturnSectionId`) чекає його серед search-параметрів
 * вкладки — загубити його тут означає зламати єдиний сценарій обох
 * поверхонь, куди приходять із ЗОВНІШНЬОГО origin.
 *
 * `<Navigate replace>` (не власний `useNavigate()` + `useEffect`) —
 * редирект тут чистий: жодного побічного ефекту перед навігацією не
 * потрібно, тож декларативна форма коротша й не має власного стану.
 *
 * Чого вона НЕ робить: `<Navigate>` теж викликає `navigate()` у
 * `useEffect` (react-router 7, `chunk-*.mjs` — `React.useEffect(() =>
 * navigate(...))` + `return null`), тобто перехід відбувається ПІСЛЯ
 * першого рендеру, не під час нього. Миготіння немає з іншої причини:
 * компонент рендерить `null`, тож у тому проміжному кадрі просто нема
 * чого показати. Не спирайся тут на «локація вже змінена синхронно» —
 * вона ще ні.
 *
 * `replace` — ОБОВʼЯЗКОВО. Найчастіший вхід сюди — повернення з
 * платіжного порталу (зовнішній origin), тобто `/settings?billing=…`
 * щойно потрапив у історію як ЄДИНИЙ запис цієї вкладки. Без `replace`
 * кнопка «Назад» після редиректу веде на `/settings`, який одразу
 * редиректить знову — нескінченний відскок. З `replace` цей проміжний
 * запис замінюється на кінцеву URL вкладки хаба, і «Назад» веде туди,
 * звідки людина прийшла (платіжний портал / лист / Bento-картка), а не в
 * цю саму пастку.
 *
 * `path: "settings/*"` (`router.tsx`) означає, що `/settings/будь-що`
 * теж матчить цей компонент. На сьогодні під префіксом немає жодного
 * реального під-шляху (жоден `Link`/`navigate` у репо не веде на
 * `/settings/<segment>`) — splat-хвіст тут просто ІГНОРУЄТЬСЯ разом з
 * рештою pathname: редирект завжди ціль '/', незалежно від того, що
 * стояло після `/settings`.
 */
export function Component() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("tab", "settings");
  const search = params.toString();

  return (
    <Navigate
      to={{
        pathname: "/",
        search: search ? `?${search}` : "",
        hash: location.hash,
      }}
      replace
    />
  );
}
