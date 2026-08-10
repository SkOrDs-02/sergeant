/**
 * Last validated: 2026-08-10
 * Status: Active
 * Форма «Внести проведене заняття» — тренування заднім числом.
 *
 * **Історія.** Такий сценарій у продукті вже був: кнопка на головній
 * «Тренувань» відкривала форму з датою й часом початку. Її змело в
 * [#589](https://github.com/SkOrDs-02/sergeant/pull/589) — той PR звів старт
 * до двох шляхів (Quick Start і шаблон), і в описі це рішення пояснене
 * прибиранням «Програм» як третього входу; ретро там не назване жодним
 * словом. Форма лишилась у коді без живої кнопки, а згодом її прибрали як
 * dead code, зафіксувавши в аудиті борг «дописати або прибрати».
 * Це — «дописати».
 *
 * **Чому не відновлення дослівно.** Стара форма питала лише початок, а
 * поле кінця в `WorkoutTimeEditor` закрите умовою `endedAt ?` — тобто
 * зʼявляється аж після завершення. Повернувши стару форму як була, ми
 * лишили б рівно ту скаргу, з якої все почалось: кінець виставити нічим.
 * Тому питаємо обидві мітки одразу.
 *
 * **Чому створюємо ВЖЕ завершене.** Ретро — це не старт. Завершене
 * тренування не займає слот «одне активне», не конфліктує з живою сесією і
 * не запускає rest-таймер. Заповнювати вправи людина йде на route-owned
 * `workout/<id>`, де завершене тренування лишається відкритим
 * (`useWorkoutsLifecycle` скидає активне лише коли route НЕ володіє id).
 */
import { useId, useMemo, useState } from "react";

import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import {
  buildPastWorkoutTimes,
  todayLocalDateString,
} from "../../pages/Workouts.helpers";

export interface LogPastWorkoutSheetProps {
  open: boolean;
  onClose: () => void;
  /** Створює завершене тренування і веде на нього. */
  onSubmit: (times: { startedAt: string; endedAt: string }) => void;
}

/** Дефолт початку — вечір: найчастіший час тренування, який доводиться правити. */
const DEFAULT_START = "18:00";
const DEFAULT_END = "19:00";

export function LogPastWorkoutSheet({
  open,
  onClose,
  onSubmit,
}: LogPastWorkoutSheetProps) {
  const fieldsId = useId();
  const dateId = `${fieldsId}-date`;
  const startId = `${fieldsId}-start`;
  const endId = `${fieldsId}-end`;

  const today = todayLocalDateString();
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);

  const t = messages.fizruk.logPast;

  const times = useMemo(
    () => buildPastWorkoutTimes(date, start, end),
    [date, start, end],
  );

  if (!open) return null;

  return (
    <div className="px-4 py-3 border-b border-line bg-bg space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-style-caption text-text">{t.title}</p>
        <Button
          variant="secondary"
          size="xs"
          iconOnly
          onClick={onClose}
          aria-label={messages.actions.close}
          title={messages.actions.close}
        >
          <Icon name="x" size={14} aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label
            className="block text-style-caption text-subtle"
            htmlFor={dateId}
          >
            {t.date}
          </label>
          <input
            id={dateId}
            type="date"
            // Відсікає майбутні ДНІ в самому пікері. Майбутній ЧАС у межах
            // сьогодні цим не ловиться — це робить `times.inFuture` нижче.
            max={today}
            className="input-focus-fizruk mt-1 w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-style-body text-text"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label
            className="block text-style-caption text-subtle"
            htmlFor={startId}
          >
            {t.start}
          </label>
          <input
            id={startId}
            type="time"
            className="input-focus-fizruk mt-1 w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-style-body text-text"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <label
            className="block text-style-caption text-subtle"
            htmlFor={endId}
          >
            {t.end}
          </label>
          <input
            id={endId}
            type="time"
            className="input-focus-fizruk mt-1 w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-style-body text-text"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>

      {/* Майбутній кінець — блокуючий стан, тож його підпис витісняє
          нейтральний «наступного дня»: інакше під формою висіли б два
          підписи, з яких лише один пояснює, чому кнопка мертва. */}
      {times?.inFuture ? (
        <p className="text-style-caption text-subtle">{t.inFuture}</p>
      ) : times?.crossesMidnight ? (
        <p className="text-style-caption text-subtle">{t.crossesMidnight}</p>
      ) : null}

      <Button
        module="fizruk"
        className="w-full h-11"
        disabled={!times || times.inFuture}
        onClick={() => {
          if (!times || times.inFuture) return;
          onSubmit({ startedAt: times.startedAt, endedAt: times.endedAt });
        }}
      >
        {t.submit}
      </Button>
    </div>
  );
}
