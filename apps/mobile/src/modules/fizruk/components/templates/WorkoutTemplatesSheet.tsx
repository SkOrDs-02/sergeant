/**
 * `WorkoutTemplatesSheet` — mobile bottom-sheet port of the Fizruk
 * `WorkoutTemplates` drawer.
 *
 * Mirrors the web component
 * (`apps/web/src/modules/fizruk/components/WorkoutTemplatesSection.tsx`)
 * but lives in a `Sheet` instead of an inline page block:
 *
 *  - List view: existing templates + "Новий шаблон" CTA. Each row has
 *    "Почати" / "Редагувати" / "Видалити".
 *  - Editor view: rename + add-from-catalogue + reorder + remove.
 *
 * State management — persistence — is owned by the hook
 * `useWorkoutTemplates`; this component is the UI shell only. Apply ↔
 * "start a new workout from a template" is delegated to the
 * `onStartTemplate` callback so the parent owns the active-workout
 * wiring (see `pages/Workouts.tsx`).
 *
 * Stage 12 of `docs/planning/storage-roadmap.md` PR #070f-mobile-dualwrite
 * already routes the hook through the SQLite dual-write pipeline, so no
 * MMKV-specific code is needed here.
 */
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Plus } from "lucide-react-native";

import type { FizrukData } from "@sergeant/fizruk-domain";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Sheet } from "@/components/ui/Sheet";

import type {
  WorkoutTemplate,
  WorkoutTemplateGroup,
} from "../../hooks/useWorkoutTemplates";

import { WorkoutTemplateEditor } from "./WorkoutTemplateEditor";
import { WorkoutTemplateRow } from "./WorkoutTemplateRow";

type RawExerciseDef = FizrukData.RawExerciseDef;

type EditorState =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "edit"; template: WorkoutTemplate };

export interface WorkoutTemplatesSheetProps {
  open: boolean;
  onClose(): void;
  templates: readonly WorkoutTemplate[];
  exercises: readonly RawExerciseDef[];
  search(query: string): readonly RawExerciseDef[];
  addTemplate(
    name: string,
    exerciseIds: string[],
    opts?: { groups?: WorkoutTemplateGroup[] },
  ): WorkoutTemplate;
  updateTemplate(id: string, patch: Partial<WorkoutTemplate>): void;
  removeTemplate(id: string): void;
  /**
   * Called when the user presses "Почати" on a row. The parent applies
   * the template to a fresh workout (see `pages/Workouts.tsx`).
   */
  onStartTemplate(template: WorkoutTemplate): void;
  testID?: string;
}

export function WorkoutTemplatesSheet({
  open,
  onClose,
  templates,
  exercises,
  search,
  addTemplate,
  updateTemplate,
  removeTemplate,
  onStartTemplate,
  testID = "fizruk-workout-templates-sheet",
}: WorkoutTemplatesSheetProps) {
  const [editor, setEditor] = useState<EditorState>({ kind: "list" });
  const [pendingDelete, setPendingDelete] = useState<WorkoutTemplate | null>(
    null,
  );

  // Re-arm "list" view whenever the sheet re-opens — the user reasonably
  // expects to see their templates again on a fresh open.
  const handleClose = useCallback(() => {
    setEditor({ kind: "list" });
    setPendingDelete(null);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(
    (
      name: string,
      orderIds: string[],
      groups: WorkoutTemplateGroup[],
    ): void => {
      if (editor.kind === "new") {
        addTemplate(name, orderIds, { groups });
      } else if (editor.kind === "edit") {
        updateTemplate(editor.template.id, {
          name,
          exerciseIds: orderIds,
          groups,
        });
      }
      setEditor({ kind: "list" });
    },
    [addTemplate, editor, updateTemplate],
  );

  const handleStart = useCallback(
    (template: WorkoutTemplate): void => {
      onStartTemplate(template);
      handleClose();
    },
    [handleClose, onStartTemplate],
  );

  const handleConfirmDelete = useCallback((): void => {
    if (pendingDelete) {
      removeTemplate(pendingDelete.id);
    }
    setPendingDelete(null);
  }, [pendingDelete, removeTemplate]);

  const title =
    editor.kind === "new"
      ? "Новий шаблон"
      : editor.kind === "edit"
        ? "Редагувати шаблон"
        : "Шаблони тренувань";
  const description =
    editor.kind === "list"
      ? "Збережені послідовності вправ — натисни «Почати», щоб одразу зайти у тренування з ними."
      : undefined;

  return (
    <>
      <Sheet
        open={open}
        onClose={handleClose}
        title={title}
        description={description}
      >
        <View testID={testID} className="gap-3">
          {editor.kind === "list" ? (
            <ListView
              templates={templates}
              onCreate={() => setEditor({ kind: "new" })}
              onEdit={(t) => setEditor({ kind: "edit", template: t })}
              onStart={handleStart}
              onDelete={(t) => setPendingDelete(t)}
              testID={testID}
            />
          ) : (
            <WorkoutTemplateEditor
              template={editor.kind === "edit" ? editor.template : null}
              exercises={exercises}
              search={search}
              onSave={handleSave}
              onCancel={() => setEditor({ kind: "list" })}
              testID={`${testID}-editor`}
            />
          )}
        </View>
      </Sheet>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Видалити шаблон?"
        description={
          pendingDelete
            ? `Шаблон «${pendingDelete.name}» буде видалено без можливості відновити.`
            : undefined
        }
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
        testID={`${testID}-delete-confirm`}
      />
    </>
  );
}

interface ListViewProps {
  templates: readonly WorkoutTemplate[];
  onCreate(): void;
  onEdit(template: WorkoutTemplate): void;
  onStart(template: WorkoutTemplate): void;
  onDelete(template: WorkoutTemplate): void;
  testID: string;
}

function ListView({
  templates,
  onCreate,
  onEdit,
  onStart,
  onDelete,
  testID,
}: ListViewProps) {
  if (templates.length === 0) {
    return (
      <View className="gap-4" testID={`${testID}-empty`}>
        <View className="rounded-xl border border-cream-300 bg-cream-50 p-4">
          <Text className="text-sm font-semibold text-fg">
            Поки немає шаблонів
          </Text>
          <Text className="text-xs text-fg-muted mt-1">
            Збережи послідовність вправ як шаблон — наступного разу запустиш
            тренування одним натиском.
          </Text>
        </View>
        <Button
          variant="primary"
          size="lg"
          leftIcon={<Plus size={18} color="#ffffff" />}
          onPress={onCreate}
          testID={`${testID}-create`}
        >
          Новий шаблон
        </Button>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <Button
        variant="primary"
        size="lg"
        leftIcon={<Plus size={18} color="#ffffff" />}
        onPress={onCreate}
        testID={`${testID}-create`}
      >
        Новий шаблон
      </Button>
      <ScrollView
        style={{ maxHeight: 480 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {templates.map((t) => (
          <WorkoutTemplateRow
            key={t.id}
            template={t}
            onStart={() => onStart(t)}
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t)}
            testID={`${testID}-row-${t.id}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}
