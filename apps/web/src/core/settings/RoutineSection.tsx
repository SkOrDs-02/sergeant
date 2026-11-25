/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Налаштування модуля «Рутина».
 *
 * AI-CONTEXT: 2026-08-03 звідси прибрано підгрупу «Звички» (активний
 * список + архів). Вона дублювала модуль — редагувати / деталі / видалити
 * там уже були, — а два унікальні для неї сценарії (порядок звичок і
 * архів) переїхали у вкладку «Звички» самого модуля
 * (`modules/routine/components/RoutineHabitsPanel.tsx`), а не зникли.
 * Тут лишились справжні налаштування: календарні тумблери, теги, категорії.
 */
import { useState } from "react";
import { useRoutineState } from "../../modules/routine/hooks/useRoutineState";
import { TagsSection } from "../../modules/routine/components/settings/TagsSection";
import { CategoriesSection } from "../../modules/routine/components/settings/CategoriesSection";
import type { CategoryDraft } from "../../modules/routine/lib/types";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";

export function RoutineSection() {
  const { routine, setRoutine, updatePref } = useRoutineState();

  const [tagDraft, setTagDraft] = useState<string>("");
  const [catDraft, setCatDraft] = useState<CategoryDraft>({
    name: "",
    emoji: "",
  });

  return (
    // V-13 — акцент бейджа вимагає пари `icon` + `module`; чому саме так,
    // розписано у `FinykSection.tsx`.
    <SettingsGroup title="Рутина">
      <div className="space-y-7 [&_[data-row]]:mx-0 [&_[data-row]]:px-0">
        <SettingsSubGroup variant="bounded" title="Календар">
          <ToggleRow
            label="Тренування з Фізрука"
            description="Заплановані тренування поруч зі звичками."
            checked={routine.prefs?.showFizrukInCalendar !== false}
            onChange={(checked) => updatePref("showFizrukInCalendar", checked)}
          />
          <ToggleRow
            label="Підписки з Фініка"
            description="Майбутні списання поруч із завданнями дня."
            checked={routine.prefs?.showFinykSubscriptionsInCalendar !== false}
            onChange={(checked) =>
              updatePref("showFinykSubscriptionsInCalendar", checked)
            }
          />
        </SettingsSubGroup>

        <TagsSection
          routine={routine}
          setRoutine={setRoutine}
          tagDraft={tagDraft}
          setTagDraft={setTagDraft}
        />
        <CategoriesSection
          routine={routine}
          setRoutine={setRoutine}
          catDraft={catDraft}
          setCatDraft={setCatDraft}
        />
      </div>
    </SettingsGroup>
  );
}
