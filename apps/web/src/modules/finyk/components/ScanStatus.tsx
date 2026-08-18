/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * Спільний «я ще працюю» для довгих очікувань Фініка: розпізнавання
 * скріна банкінгу, фото чека, лукап у ДПС, читання виписки. Vision-виклик
 * триває 5–20 секунд, і без жодного сигналу екран читається як завислий
 * (бета-фідбек №5, 2026-08-18: «є пауза і не зрозуміло це триває процес
 * чи фрозен скрін»).
 *
 * Три шари сигналу, навмисно різні за природою:
 *   1. спінер — миттєвий, працює навіть коли текст ще не змінювався;
 *   2. `label` — викликач міняє його на КОЖНІЙ реальній фазі (готую
 *      фото → розпізнаю), тож рух видно ще до відповіді сервера;
 *   3. `slowHint` — зʼявляється лише після {@link SLOW_HINT_DELAY_MS} і
 *      пояснює, ЧОМУ досі крутиться.
 *
 * Шар 2+3 тут не прикраса: `Spinner` крутиться під `motion-safe:`, тож у
 * людини з `prefers-reduced-motion` він СТАТИЧНИЙ — і тоді єдиний доказ
 * життя це текст, що змінюється. Не прибирай зміну label-ів на користь
 * одного статичного рядка.
 *
 * Фейкового прогрес-бару тут свідомо нема: реального відсотка виконання
 * ні vision, ні ДПС не віддають, а вигаданий відсоток, що застряг на 80%,
 * породжує рівно ту саму недовіру, що й зависла пауза.
 */
import { useEffect, useState } from "react";
import { Spinner } from "@shared/components/ui/Spinner";

/** Скільки чекати, перш ніж пояснювати причину затримки. Поріг вищий за
 * типовий швидкий скан — щоб на коротких очікуваннях підказка не блимала
 * і не створювала враження, що щось пішло не так. */
export const SLOW_HINT_DELAY_MS = 7000;

export interface ScanStatusProps {
  /** Що саме зараз відбувається, від першої особи: «Розпізнаю чек…». */
  label: string;
  /** Пояснення для довгого очікування — після 7 секунд. */
  slowHint?: string | undefined;
}

/** Стан очікування у викликача. Пара, а не два окремі стейти: підказка
 * без свого label-а (чи навпаки) — завжди баг. */
export interface ScanStatusState {
  label: string;
  hint?: string | undefined;
}

export function ScanStatus({ label, slowHint }: ScanStatusProps) {
  const [slow, setSlow] = useState(false);

  // Таймер живе від МОНТУВАННЯ, а не від зміни `label`: питання «чи воно
  // взагалі живе» вимірюється загальним часом очікування, тож перезапуск
  // на кожній фазі відсував би підказку саме тоді, коли вона потрібна.
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-2 py-10 text-center"
    >
      <Spinner size="md" />
      <p className="text-style-caption text-muted">{label}</p>
      {slowHint && slow && (
        <p className="text-style-caption text-subtle">{slowHint}</p>
      )}
    </div>
  );
}
