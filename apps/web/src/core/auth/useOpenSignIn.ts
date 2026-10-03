/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * **Один спосіб відкрити екран входу — SPA-перехід, не перезавантаження.**
 *
 * AI-CONTEXT: до цієї поставки той самий tap «Увійти» відкривав
 * `/sign-in` чотирма різними шляхами (аудит founder-а 2026-09-11, хвиля
 * 2, п. A1): `navigate(SIGN_IN_PATH)` у хабі (`RootLayout.tsx`),
 * `<a href={SIGN_IN_PATH}>` у гейті чату, `<a href="/auth">` у фото їжі
 * (зайвий редірект-хоп на `/sign-in`) і
 * `onOpenAuth ?? (() => navigate("/auth"))` у Фініку — опційний фолбек,
 * який тихо нічого не робив там, де shell забув передати обробник.
 * Наслідок: з однакової на вигляд кнопки — то SPA-перехід, то повне
 * перезавантаження сторінки, то зайвий хоп через редірект.
 *
 * Це єдина точка, через яку решта поверхонь мають відкривати вхід. Нові
 * поверхні підключають цей хук, а не пишуть власний
 * `navigate("/sign-in")` чи `<a href="...">`.
 *
 * AI-DANGER: використовуй лише всередині дерева `<Router>` — `useNavigate()`
 * кидає інваріант одразу при рендері поза роутером. Весь застосунок
 * рендериться під `<Router>` у проді, тож для звичайного продуктового
 * коду це завжди так. Виняток — `core/hub/chat/ChatAuthGate.tsx`, який
 * НАВМИСНО лишається на `<a href={SIGN_IN_PATH}>`: `HubChat` монтується
 * поза `<Router>` у частині юніт-тестів (`HubChat.test.tsx` рендерить
 * `<HubChat onClose={vi.fn()} />` без обгортки), і переведення гейта
 * чату на цей хук завалило б ті тести на самому рендері, а не лише на
 * навігації. Той самий компроміс — `core/access/AccessDenialNotice.tsx`.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { SIGN_IN_PATH } from "../app/appPaths";

/**
 * Повертає стабільний колбек, що відкриває `/sign-in` через
 * client-side навігацію (без перезавантаження сторінки).
 */
export function useOpenSignIn(): () => void {
  const navigate = useNavigate();
  return useCallback(() => navigate(SIGN_IN_PATH), [navigate]);
}
