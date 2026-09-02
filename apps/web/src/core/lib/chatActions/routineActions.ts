import {
  loadRoutineState,
  saveRoutineState,
} from "../../../modules/routine/lib/routineStorage";
import { persistRoutineState } from "./routinePersistence";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import {
  applyCreateHabit,
  applyPauseHabitBetween,
  applyResumeHabitFrom,
  applySetHabitSkip,
  applyToggleHabitCompletion,
  flexibleMaxStreakAllTime,
  flexibleStreakBreakdown,
  habitCompletionRate,
  habitScheduledOnDate,
  resolveHabitGlyph,
  upgradeHabitGlyph,
} from "@sergeant/routine-domain";
import type {
  MarkHabitDoneAction,
  CreateHabitAction,
  CreateReminderAction,
  CompleteHabitForDateAction,
  ArchiveHabitAction,
  AddCalendarEventAction,
  EditHabitAction,
  ReorderHabitsAction,
  HabitStatsAction,
  HabitTrendAction,
  SetHabitScheduleAction,
  PauseHabitAction,
  ChatAction,
  ChatActionResult,
} from "./types";
import {
  DAY_MS,
  WEEKDAY_LABEL_UK,
  normalizeDayToken,
  normalizeHabitId,
  isDateKey,
} from "./routineActions.helpers";

export function handleRoutineAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "mark_habit_done": {
      const { habit_id: rawHabitId, date: habitDate } = (
        action as MarkHabitDoneAction
      ).input;
      const habitId = normalizeHabitId(rawHabitId);
      const routineState = loadRoutineState();
      const habit = routineState.habits.find((h) => h.id === habitId);
      // Validate before writing: an unmatched id (model passed a stale or
      // `id:`-prefixed value) must not silently write a phantom completion
      // key and then claim success (QA D-005).
      if (!habit) {
        return `Не знайшов звичку "${habitId || String(rawHabitId ?? "")}", перевір список звичок.`;
      }
      const targetDate = habitDate || getKyivDayKey();
      const habitLabel = habit.name || habitId;
      const prevArr = Array.isArray(routineState.completions[habitId])
        ? routineState.completions[habitId]
        : [];
      const alreadyDone = prevArr.includes(targetDate);
      const result = `Звичку "${habitLabel}" відмічено як виконану (${targetDate})`;
      // Ідемпотентно: якщо вже відмічено — жодного запису, той самий
      // no-op, що й до фіксу.
      if (alreadyDone) {
        return { result, confirm: persistRoutineState(routineState) };
      }
      // LOG-2 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`) —
      // домен-редʼюсер, а не ручний запис у `completions`:
      // `applyToggleHabitCompletion` (1) не пише незаплановий день (той
      // самий `habitScheduledOnDate`-гейт, що чекбокс в UI) і (2) знімає
      // «не зміг з причиною» на цю дату (канон §5 — стани взаємовиключні).
      const previousSkip = routineState.skips?.[habitId]?.[targetDate];
      const nextState = applyToggleHabitCompletion(
        routineState,
        habitId,
        targetDate,
      );
      if (nextState === routineState) {
        return `Звичку "${habitLabel}" не заплановано на ${targetDate}, тому не відмічаю.`;
      }
      const confirm = persistRoutineState(nextState);
      return {
        result,
        confirm,
        undo: () => {
          const cur = loadRoutineState();
          // Toggle назад знімає саме цю відмітку (idempotent: якщо стан
          // тим часом змінили ще раз, `applyToggleHabitCompletion` все одно
          // діє коректно на актуальному знімку).
          const reverted = applyToggleHabitCompletion(cur, habitId, targetDate);
          const restored = previousSkip
            ? applySetHabitSkip(
                reverted,
                habitId,
                targetDate,
                previousSkip.reason,
                previousSkip.note,
              )
            : reverted;
          saveRoutineState(restored);
        },
      };
    }
    case "create_habit": {
      const {
        name,
        emoji,
        recurrence,
        weekdays,
        time_of_day: timeOfDay,
      } = (action as CreateHabitAction).input;
      const trimmed = (name || "").trim();
      if (!trimmed) return "Не можу створити звичку без назви.";
      const allowedRec = new Set([
        "daily",
        "weekdays",
        "weekly",
        "monthly",
        "once",
      ]);
      const rec =
        recurrence && allowedRec.has(recurrence) ? recurrence : "daily";
      // Mon-first 0..6 — passthrough без remap; anchor задає опис `weekdays`
      // у `apps/server/src/modules/chat/toolDefs/routine.ts` (audit E-5).
      const wdays = Array.isArray(weekdays)
        ? weekdays
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : undefined;
      const tod =
        timeOfDay && /^\d{1,2}:\d{2}$/.test(String(timeOfDay).trim())
          ? String(timeOfDay).trim().padStart(5, "0")
          : "";
      const stateBefore = loadRoutineState();
      const nextState = applyCreateHabit(stateBefore, {
        name: trimmed,
        // `emoji` з tool-call може бути й emoji, і slug — reducer
        // нормалізує обидва (`@sergeant/routine-domain` → `glyphs.ts`).
        emoji: resolveHabitGlyph(emoji),
        recurrence: rec,
        weekdays: wdays && wdays.length ? wdays : undefined,
        timeOfDay: tod,
      });
      const confirm = persistRoutineState(nextState);
      const created = nextState.habits[nextState.habits.length - 1];
      const createdId = created?.id;
      const recLabelMap: Record<string, string> = {
        daily: "щодня",
        weekdays: "по буднях",
        weekly: "щотижня",
        monthly: "щомісяця",
        once: "разово",
      };
      const result = `Звичку "${trimmed}" створено (${recLabelMap[rec] || rec}, id:${createdId || "?"})`;
      if (!createdId) return { result, confirm };
      // Undo тримає id (а не повний snapshot), щоб не переписувати
      // інші зміни, які можуть статися між створенням і undo
      // (інша звичка створена, completions додані, etc.).
      return {
        result,
        confirm,
        undo: () => {
          const cur = loadRoutineState();
          const habits = Array.isArray(cur.habits)
            ? cur.habits.filter((h) => h.id !== createdId)
            : [];
          if (habits.length === (cur.habits?.length ?? 0)) return;
          const curCompletions = { ...cur.completions };
          delete curCompletions[createdId];
          saveRoutineState({
            ...cur,
            habits,
            completions: curCompletions,
          });
        },
      };
    }
    case "create_reminder": {
      const { habit_id, time } = (action as CreateReminderAction).input;
      const id = normalizeHabitId(habit_id);
      const t = String(time || "").trim();
      if (!id) return "Потрібен habit_id.";
      if (!/^\d{1,2}:\d{2}$/.test(t)) return "Час має бути у форматі HH:MM.";
      const normTime = t.padStart(5, "0");
      const state = loadRoutineState();
      const habits = state.habits.slice();
      const hIdx = habits.findIndex((h) => h.id === id);
      if (hIdx < 0) return `Звичку ${id} не знайдено.`;
      const habit = habits[hIdx];
      if (!habit) return `Звичку ${id} не знайдено.`;
      const reminders = Array.isArray(habit.reminderTimes)
        ? [...habit.reminderTimes]
        : [];
      if (reminders.includes(normTime)) {
        return `Нагадування ${normTime} для "${habit.name || id}" вже існує.`;
      }
      reminders.push(normTime);
      reminders.sort();
      habits[hIdx] = { ...habit, reminderTimes: reminders };
      const confirm = persistRoutineState({ ...state, habits });
      const habitName = habit.name || id;
      return {
        result: `Нагадування ${normTime} додано до "${habitName}"`,
        confirm,
        undo: () => {
          const cur = loadRoutineState();
          const curHabits = cur.habits.slice();
          const i = curHabits.findIndex((h) => h.id === id);
          if (i < 0) return;
          const target = curHabits[i];
          if (!target) return;
          const list = Array.isArray(target.reminderTimes)
            ? target.reminderTimes.filter((x) => x !== normTime)
            : [];
          curHabits[i] = { ...target, reminderTimes: list };
          saveRoutineState({ ...cur, habits: curHabits });
        },
      };
    }
    case "complete_habit_for_date": {
      const { habit_id, date, completed } = (
        action as CompleteHabitForDateAction
      ).input;
      const id = normalizeHabitId(habit_id);
      const d = String(date || "").trim();
      if (!id) return "Потрібен habit_id.";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d))
        return "Дата має бути у форматі YYYY-MM-DD.";
      const doComplete = completed !== false;
      const state = loadRoutineState();
      const habit = state.habits.find((h) => h.id === id);
      if (!habit) return `Звичку ${id} не знайдено.`;
      const habitLabel = habit.name || id;
      const prevArr = Array.isArray(state.completions[id])
        ? state.completions[id]
        : [];
      const has = prevArr.includes(d);
      const result = `Звичку "${habitLabel}" ${doComplete ? "відмічено" : "знято з позначки"} на ${d}`;
      // Уже в бажаному стані — no-op, та сама ідемпотентність, що й до фіксу.
      if (has === doComplete) {
        return { result, confirm: persistRoutineState(state) };
      }
      if (doComplete) {
        // LOG-2 — той самий домен-редʼюсер, що й `mark_habit_done`: не
        // пише незаплановий день, знімає «не зміг» на цю дату (канон §5).
        const previousSkip = state.skips?.[id]?.[d];
        const nextState = applyToggleHabitCompletion(state, id, d);
        if (nextState === state) {
          return `Звичку "${habitLabel}" не заплановано на ${d}, тому не відмічаю.`;
        }
        const confirm = persistRoutineState(nextState);
        return {
          result,
          confirm,
          undo: () => {
            const cur = loadRoutineState();
            const reverted = applyToggleHabitCompletion(cur, id, d);
            const restored = previousSkip
              ? applySetHabitSkip(
                  reverted,
                  id,
                  d,
                  previousSkip.reason,
                  previousSkip.note,
                )
              : reverted;
            saveRoutineState(restored);
          },
        };
      }
      // completed:false — знімаємо відмітку. Toggle прибирає незалежно від
      // розкладу (день уже позначено — самим фактом позначки він був
      // запланований, коли позначку ставили).
      const confirm = persistRoutineState(
        applyToggleHabitCompletion(state, id, d),
      );
      return {
        result,
        confirm,
        undo: () => {
          const cur = loadRoutineState();
          saveRoutineState(applyToggleHabitCompletion(cur, id, d));
        },
      };
    }
    case "archive_habit": {
      const { habit_id, archived } = (action as ArchiveHabitAction).input;
      const id = normalizeHabitId(habit_id);
      const doArchive = archived !== false;
      if (!id) return "Потрібен habit_id.";
      const state = loadRoutineState();
      const habits = state.habits.slice();
      const idx = habits.findIndex((h) => h.id === id);
      if (idx < 0) return `Звичку ${id} не знайдено.`;
      const habit = habits[idx];
      if (!habit) return `Звичку ${id} не знайдено.`;
      if (!!habit.archived === doArchive) {
        return `Звичку "${habit.name || id}" вже ${doArchive ? "заархівовано" : "активна"}.`;
      }
      habits[idx] = { ...habit, archived: doArchive };
      const confirm = persistRoutineState({ ...state, habits });
      // Рішення founder-а #8: оборотні дії виконуються одразу, але з
      // кнопкою «скасувати». Архівація оборотна за визначенням (той самий
      // інструмент приймає `archived: false`), тож підтвердження їй не
      // потрібне — потрібен undo. Читаємо стан заново, а не замикаємось на
      // `state`: між дією і натисканням undo користувач міг змінити інші
      // звички, і запис старого знімка стер би ті зміни.
      const previous = !!habit.archived;
      return {
        result: `Звичку "${habit.name || id}" ${doArchive ? "заархівовано" : "повернуто з архіву"}`,
        confirm,
        undo: () => {
          const current = loadRoutineState();
          const list = current.habits.slice();
          const at = list.findIndex((h) => h.id === id);
          if (at < 0) return;
          const target = list[at];
          if (!target) return;
          list[at] = { ...target, archived: previous };
          saveRoutineState({ ...current, habits: list });
        },
      };
    }
    case "add_calendar_event": {
      const { name, date, time, emoji } = (action as AddCalendarEventAction)
        .input;
      const evName = (name || "").trim();
      const d = String(date || "").trim();
      if (!evName) return "Потрібна назва події.";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d))
        return "Дата має бути у форматі YYYY-MM-DD.";
      const tod =
        time && /^\d{1,2}:\d{2}$/.test(String(time).trim())
          ? String(time).trim().padStart(5, "0")
          : "";
      const state = loadRoutineState();
      const nextState = applyCreateHabit(state, {
        name: evName,
        emoji: upgradeHabitGlyph(emoji) ?? "calendar-check",
        recurrence: "once",
        startDate: d,
        endDate: d,
        timeOfDay: tod,
      });
      const confirm = persistRoutineState(nextState);
      const created = nextState.habits[nextState.habits.length - 1];
      return {
        result: `Подію "${evName}" додано на ${d}${tod ? ` о ${tod}` : ""} (id:${created?.id || "?"})`,
        confirm,
      };
    }
    case "edit_habit": {
      const { habit_id, name, emoji, recurrence, weekdays } = (
        action as EditHabitAction
      ).input;
      const id = normalizeHabitId(habit_id);
      if (!id) return "Потрібен habit_id.";
      const state = loadRoutineState();
      const habits = state.habits.slice();
      const hIdx = habits.findIndex((h) => h.id === id);
      if (hIdx < 0) return `Звичку ${id} не знайдено.`;
      const habit = habits[hIdx];
      if (!habit) return `Звичку ${id} не знайдено.`;
      const updated = { ...habit };
      const changes: string[] = [];
      if (name && name.trim()) {
        updated.name = name.trim();
        changes.push(`назва → "${name.trim()}"`);
      }
      const nextGlyph = upgradeHabitGlyph(emoji);
      if (nextGlyph) {
        updated.emoji = nextGlyph;
        changes.push(`іконка → ${nextGlyph}`);
      }
      if (recurrence) {
        const allowedRec = new Set(["daily", "weekdays", "weekly", "monthly"]);
        if (allowedRec.has(recurrence)) {
          updated.recurrence = recurrence;
          changes.push(`розклад → ${recurrence}`);
        }
      }
      // Mon-first 0..6 — passthrough без remap (див. create_habit вище).
      if (Array.isArray(weekdays) && weekdays.length > 0) {
        updated.weekdays = weekdays.filter(
          (d) => Number.isInteger(d) && d >= 0 && d <= 6,
        );
        changes.push(`дні → [${updated.weekdays.join(",")}]`);
      }
      if (changes.length === 0) return "Немає змін для оновлення.";
      habits[hIdx] = updated;
      const confirm = persistRoutineState({ ...state, habits });
      return {
        result: `Звичку "${updated.name || id}" оновлено: ${changes.join(", ")}`,
        confirm,
      };
    }
    case "set_habit_schedule": {
      const { habit_id, days } = (action as SetHabitScheduleAction).input;
      const id = normalizeHabitId(habit_id);
      if (!id) return "Потрібен habit_id.";
      if (!Array.isArray(days) || days.length === 0)
        return "Потрібен непорожній масив days.";
      const seen = new Set<number>();
      const normalized: number[] = [];
      const unknown: string[] = [];
      for (const raw of days) {
        const idx = normalizeDayToken(raw);
        if (idx === null) {
          if (typeof raw === "string" && raw.trim()) unknown.push(raw.trim());
          continue;
        }
        if (seen.has(idx)) continue;
        seen.add(idx);
        normalized.push(idx);
      }
      if (normalized.length === 0)
        return `Не вдалось розпізнати дні: ${unknown.join(", ") || "(порожньо)"}. Очікую mon/tue/…/sun або пн/вт/…/нд.`;
      normalized.sort((a, b) => a - b);
      const state = loadRoutineState();
      const habits = state.habits.slice();
      const hIdx = habits.findIndex((h) => h.id === id);
      if (hIdx < 0) return `Звичку ${id} не знайдено.`;
      const habit = habits[hIdx];
      if (!habit) return `Звичку ${id} не знайдено.`;
      habits[hIdx] = {
        ...habit,
        recurrence: "weekly",
        weekdays: normalized,
      };
      const confirm = persistRoutineState({ ...state, habits });
      const labels = normalized.map((n) => WEEKDAY_LABEL_UK[n]).join(", ");
      return {
        result: `Розклад звички "${habit.name || id}": ${labels}`,
        confirm,
      };
    }
    case "pause_habit": {
      // Хвиля 4: тул пише ДАТОВАНИЙ інтервал, а не недатований прапор
      // `paused`. Старий шлях був головною пасткою E-3 — опис обіцяв
      // «зберігає історію», а насправді пауза ретроактивно вимивала
      // звичку з усіх минулих вікон і обнуляла стрік.
      const { habit_id, paused, from, to } = (action as PauseHabitAction).input;
      const id = normalizeHabitId(habit_id);
      if (!id) return "Потрібен habit_id.";
      const target = paused !== false;
      const state = loadRoutineState();
      const habit = state.habits.find((h) => h.id === id);
      if (!habit) return `Звичку ${id} не знайдено.`;
      const habitName = habit.name || id;
      const todayKey = getKyivDayKey();

      if (!target) {
        const next = applyResumeHabitFrom(state, id, todayKey);
        if (next === state) return `Звичка "${habitName}" вже активна.`;
        return {
          result: `Звичку "${habitName}" повернуто з паузи від сьогодні.`,
          confirm: persistRoutineState(next),
        };
      }

      const fromKey = isDateKey(from) ? from : todayKey;
      const toKey = isDateKey(to) ? to : null;
      if (toKey !== null && toKey < fromKey) {
        return "Кінець паузи не може бути раніше за початок.";
      }
      const next = applyPauseHabitBetween(state, id, fromKey, toKey);
      if (next === state) {
        return `Звичка "${habitName}" уже на паузі в цьому діапазоні.`;
      }
      const confirm = persistRoutineState(next);
      return {
        result:
          toKey === null
            ? `Звичку "${habitName}" поставлено на паузу з ${fromKey}. Ці дні не рахуються, серія їх не помітить.`
            : `Звичку "${habitName}" поставлено на паузу ${fromKey} – ${toKey}. Ці дні не рахуються, серія їх не помітить.`,
        confirm,
      };
    }
    case "reorder_habits": {
      const { habit_ids } = (action as ReorderHabitsAction).input;
      if (!Array.isArray(habit_ids) || habit_ids.length === 0)
        return "Потрібен масив habit_ids.";
      const state = loadRoutineState();
      const habits = state.habits.slice();
      const habitMap = new Map(habits.map((h) => [h.id, h]));
      const reordered = habit_ids
        .map((id) => habitMap.get(id))
        .filter((h): h is (typeof habits)[0] => h != null);
      const idSet = new Set(habit_ids);
      const remaining = habits.filter((h) => !idSet.has(h.id));
      const confirm = persistRoutineState({
        ...state,
        habits: [...reordered, ...remaining],
      });
      return {
        result: `Порядок звичок оновлено (${reordered.length} переміщено)`,
        confirm,
      };
    }
    case "habit_stats": {
      const { habit_id, period_days } = (action as HabitStatsAction).input;
      const id = normalizeHabitId(habit_id);
      if (!id) return "Потрібен habit_id.";
      const days = Number(period_days) || 30;
      const state = loadRoutineState();
      const habit = state.habits.find((h) => h.id === id);
      if (!habit) return `Звичку ${id} не знайдено.`;
      // LOG-1 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`)
      // — той самий гнучкий стрік і той самий per-habit rate, що рахує UI
      // (`flexStreak.ts`/`streaks.ts`), а не третя жорстка реалізація, яка
      // обнуляла серію на першому пропущеному дні незалежно від паузи,
      // пропуску з причиною чи розкладу «3/тиждень».
      const completionsForHabit = state.completions[id];
      const skipsForHabit = state.skips?.[id];
      const now = Date.now();
      const todayKey = getKyivDayKey(now);
      const startKey = getKyivDayKey(now - (days - 1) * DAY_MS);
      const { completed, scheduled } = habitCompletionRate(
        habit,
        completionsForHabit,
        startKey,
        todayKey,
      );
      const pct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
      const currentStreak = flexibleStreakBreakdown(
        habit,
        completionsForHabit,
        todayKey,
        { skipsForHabit },
      ).days;
      const maxStreak = flexibleMaxStreakAllTime(habit, completionsForHabit, {
        skipsForHabit,
      });
      const missedDates: string[] = [];
      for (let i = 0; i < days && missedDates.length < 5; i++) {
        const dk = getKyivDayKey(now - i * DAY_MS);
        if (!habitScheduledOnDate(habit, dk)) continue;
        const done =
          Array.isArray(completionsForHabit) &&
          completionsForHabit.includes(dk);
        if (done || skipsForHabit?.[dk]) continue;
        missedDates.push(dk);
      }
      const parts: string[] = [
        // Без гліфа: у полі лежить icon-slug, і «droplet Пити воду» в
        // тексті чату виглядало б як помилка рендера.
        `Статистика "${habit.name || id}" за ${days} днів:`,
        `Виконано: ${completed}/${scheduled} (${pct}%)`,
        `Поточна серія: ${currentStreak} днів`,
        `Макс. серія: ${maxStreak} днів`,
      ];
      if (missedDates.length > 0) {
        parts.push(`Останні пропуски: ${missedDates.join(", ")}`);
      }
      return parts.join("\n");
    }
    // ── Харчування v2 ──────────────────────────────────────────
    case "habit_trend": {
      const { habit_id, period_days } =
        (action as HabitTrendAction).input || {};
      const days = Number(period_days) || 30;
      const state = loadRoutineState();
      if (state.habits.length === 0) return "Немає звичок.";
      const habits = habit_id
        ? state.habits.filter((h) => h.id === habit_id)
        : state.habits.filter((h) => !h.archived);
      if (habits.length === 0) return `Звичку ${habit_id} не знайдено.`;
      const completions = state.completions;
      const histSets = new Map<string, Set<string>>();
      for (const h of habits) {
        const arr = Array.isArray(completions[h.id]) ? completions[h.id] : [];
        histSets.set(h.id, new Set(arr));
      }
      const now = Date.now();
      const weeks = Math.ceil(days / 7);
      const weeklyData: number[] = [];
      for (let w = 0; w < weeks; w++) {
        let done = 0;
        let possible = 0;
        for (let d = 0; d < 7; d++) {
          const dayOffset = w * 7 + d;
          if (dayOffset >= days) break;
          const dk = getKyivDayKey(now - dayOffset * DAY_MS);
          for (const h of habits) {
            possible++;
            const hist = histSets.get(h.id);
            if (hist && hist.has(dk)) done++;
          }
        }
        weeklyData.push(possible > 0 ? Math.round((done / possible) * 100) : 0);
      }
      const parts: string[] = [
        `Тренд звичок за ${days} днів (${habits.length} звичок):`,
      ];
      weeklyData.reverse();
      for (let i = 0; i < weeklyData.length; i++) {
        parts.push(`  Тиждень ${i + 1}: ${weeklyData[i]}%`);
      }
      const first = weeklyData[0];
      const last = weeklyData[weeklyData.length - 1];
      if (weeklyData.length >= 2 && first !== undefined && last !== undefined) {
        const trend =
          last > first
            ? "покращується"
            : last < first
              ? "погіршується"
              : "стабільно";
        parts.push(`Тренд: ${trend} (${first}% → ${last}%)`);
      }
      return parts.join("\n");
    }
    // ── Утиліти ────────────────────────────────────────────────
    default:
      return undefined;
  }
}
