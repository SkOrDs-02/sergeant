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
 * **Чому `Sheet`, а не інлайн-смуга.** Перша версія рендерилась просто
 * блоком у потоці сторінки — і на беті це читалось як «кнопка не працює»:
 * форма зʼявлялась ПІД картками «Останні тренування» й «Довідники», тобто
 * за межами екрана, а кнопка, яка її відкриває, — угорі. Плюс вигляд голої
 * смуги без панелі. `Sheet` — канонічний примітив (портал повз усі
 * transform-контексти, фокус-трап, Escape, затемнення, свайп-закриття,
 * кнопка закриття 44×44, відступ під нижнє меню й клавіатуру); саме заради
 * таких випадків він і зводив докупи шість саморобних шітів.
 *
 * **Кінець не записується одразу.** Форма віддає обидві мітки, але сесія
 * створюється НЕзавершеною, а введений кінець чекає у `pendingRetroEnd` до
 * кроку «Завершити». Перша версія ставила `endedAt` відразу — і тим вела
 * людину повз увесь післятренувальний потік: завершене тренування малюється
 * read-only підсумком, тож ні вправи додати, ні оцінку пройти. Розбір —
 * у [`fizruk.md` §3](../../../../../../docs/01-product/model/fizruk.md).
 *
 * **Поля — спільні примітиви, а не сирі `<input>`.** Перша версія малювала
 * `type="date"` / `type="time"` руками з `w-full`, і на iOS форма виїжджала
 * за екран: нативні контроли мають власний intrinsic inline-size, а комірка
 * grid-а з дефолтним `min-width: auto` слухняно під нього розширювалась.
 * `DateField` існує рівно проти цього (той самий баг ловили у формах Фініка),
 * `TimeField` — його time-двійник. Скарга тестера 2026-08-16.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@shared/components/ui/Button";
import { DateField } from "@shared/components/ui/DateField";
import { Sheet } from "@shared/components/ui/Sheet";
import { TimeField } from "@shared/components/ui/TimeField";
import { messages } from "@shared/i18n/uk";
import {
  buildPastWorkoutTimes,
  todayLocalDateString,
} from "../../pages/Workouts.helpers";

export interface LogPastWorkoutSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Створює ЖИВУ сесію з цими мітками й веде на неї. `endedAt` не пишеться
   * одразу — він чекає кроку «Завершити» (див. докблок вище).
   */
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

  // Перераховуємо на КОЖНЕ відкриття, а не раз на монтування. Шіт живе в
  // дереві постійно (закритий = `open: false`), тож обчислений один раз
  // «сьогодні» переживає північ: застосунок, відкритий звечора, о 00:02
  // пропонував учорашню дату й ліміт `max` теж учорашній.
  const today = useMemo(() => (open ? todayLocalDateString() : ""), [open]);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);

  // Відкриття = новий запис: підставляємо свіже «сьогодні» замість того, що
  // лишилось від минулого разу.
  const lastOpenRef = useRef(false);
  useEffect(() => {
    if (open && !lastOpenRef.current) setDate(today);
    lastOpenRef.current = open;
  }, [open, today]);

  const t = messages.fizruk.logPast;

  const times = useMemo(
    () => buildPastWorkoutTimes(date, start, end),
    [date, start, end],
  );

  const blocked = !times || times.inFuture || times.implausiblyLong;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.title}
      closeLabel={messages.actions.close}
      footer={
        <Button
          module="fizruk"
          className="w-full h-11"
          disabled={blocked}
          onClick={() => {
            // Та сама умова, що й `disabled` — кнопка не єдиний шлях сюди
            // (Enter, автоклік, тест), і розʼїхатись цим двом не можна.
            if (blocked) return;
            onSubmit({ startedAt: times.startedAt, endedAt: times.endedAt });
          }}
        >
          {t.submit}
        </Button>
      }
    >
      <div className="w-full min-w-0 max-w-full space-y-3 pt-1">
        {/* `min-w-0` на КОЖНІЙ комірці, не лише на самих полях: без нього
            grid-трек росте під intrinsic-ширину нативного пікера, і картка
            їде за екран навіть тоді, коли поле всередині поводиться чемно. */}
        <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <DateField
              id={dateId}
              label={t.date}
              // Відсікає майбутні ДНІ в самому пікері. Майбутній ЧАС у межах
              // сьогодні цим не ловиться — це робить `times.inFuture` нижче.
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <TimeField
              id={startId}
              label={t.start}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <TimeField
              id={endId}
              label={t.end}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>

        {/* Один підпис за раз, у порядку «причина → наслідок». Описка в часі
            («18:00 → 16:00») на сьогоднішній даті дає ОБИДВА стани, бо
            перенесений кінець їде в завтра; показати тут «завершення ще не
            настало» означало б пояснити наслідок і сховати причину. */}
        {times?.implausiblyLong ? (
          <p className="text-style-caption text-subtle">{t.implausiblyLong}</p>
        ) : times?.inFuture ? (
          <p className="text-style-caption text-subtle">{t.inFuture}</p>
        ) : times?.crossesMidnight ? (
          <p className="text-style-caption text-subtle">{t.crossesMidnight}</p>
        ) : null}
      </div>
    </Sheet>
  );
}
