/**
 * Status: Active
 *
 * Серверна памʼять Сержанта в Профілі: список усього, що асистент
 * запамʼятав (`AiMemoryList`), і кнопка повного очищення. До огляду
 * 2026-09-04 цей блок жив у Налаштуваннях → «Конфіденційність» поруч зі
 * згодами, а банк фактів — у Профілі → «Памʼять»: два входи в одну памʼять
 * (V-11 розвів їх словами, не структурою). Тепер обидва списки поруч в
 * одній секції Профілю, а в Налаштуваннях лишилась лише згода.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { meApi } from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { aiMemoryKeys } from "@shared/lib/api/queryKeys";
import { AiMemoryList } from "../settings/AiMemoryList";
import { writeMemoryEntries } from "./memoryBank";

const copy = messages.privacy.aiMemory;

export function AiMemorySection() {
  const queryClient = useQueryClient();
  const [clearingMemory, setClearingMemory] = useState(false);
  const [memoryClearStatus, setMemoryClearStatus] = useState<string | null>(
    null,
  );
  const [clearMemoryConfirmOpen, setClearMemoryConfirmOpen] = useState(false);

  const handleClearMemoryConfirm = async () => {
    setClearMemoryConfirmOpen(false);
    // Finding #2 (2026-08-08): пропуск одного мікротаску дає React спершу
    // закомітити рендер, що лише закриває діалог, і повернути фокус на
    // тригер ДО того, як він стане `disabled` (див. `useDialogFocusTrap`).
    await Promise.resolve();
    setClearingMemory(true);
    setMemoryClearStatus(null);
    // Дефект #5 (CodeRabbit PR #756/#757): серверний DELETE і локальний
    // запис — окремі кроки з окремими станами. Сервер стирає незворотно,
    // тож результат для людини залежить лише від нього; локальна невдача —
    // третій, чесний стан.
    try {
      await meApi.clearAiMemory();
    } catch {
      setMemoryClearStatus("Не вдалося очистити памʼять ШІ.");
      setClearingMemory(false);
      return;
    }
    let localWriteFailed = false;
    try {
      writeMemoryEntries([]);
    } catch {
      localWriteFailed = true;
    }
    // L-20: інвалідація фабричним ключем (Hard Rule #2), не через await —
    // очищення вже відбулось, refetch списку — фонова робота (finding #10).
    void queryClient.invalidateQueries({ queryKey: aiMemoryKeys.all });
    setMemoryClearStatus(
      localWriteFailed
        ? "Памʼять ШІ очищено на сервері, але локальну копію стерти не вдалося."
        : "Памʼять ШІ очищено.",
    );
    setClearingMemory(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-style-overline text-text">{copy.sectionTitle}</h3>
        <p className="text-style-body text-subtle leading-relaxed mt-1">
          {copy.sectionScope} {copy.sectionHint}
        </p>
      </div>
      <AiMemoryList />
      <div className="border-t border-line/60 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={clearingMemory}
          className="text-danger-strong"
          onClick={() => setClearMemoryConfirmOpen(true)}
        >
          {clearingMemory ? copy.clearing : copy.clearButton}
        </Button>
        {memoryClearStatus ? (
          <p className="mt-2 text-style-caption text-subtle" role="status">
            {memoryClearStatus}
          </p>
        ) : null}
      </div>

      {/* V-6: незворотне видалення підтверджується діалогом застосунку, а
          не `window.confirm`. */}
      <ConfirmDialog
        open={clearMemoryConfirmOpen}
        title={copy.clearConfirmTitle}
        description={copy.clearConfirmBody}
        confirmLabel={copy.clearConfirmButton}
        danger
        onConfirm={() => void handleClearMemoryConfirm()}
        onCancel={() => setClearMemoryConfirmOpen(false)}
      />
    </div>
  );
}
