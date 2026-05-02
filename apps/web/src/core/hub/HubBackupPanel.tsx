import { useRef } from "react";
import { downloadJson } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { useToast } from "@shared/hooks/useToast";
import { cn } from "@shared/lib/cn";
import { applyHubBackupPayload, buildHubBackupPayload } from "./hubBackup";

interface HubBackupPanelProps {
  className?: string;
}

export function HubBackupPanel({ className }: HubBackupPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const exportJson = async () => {
    const payload = buildHubBackupPayload({ includeChat: false });
    await downloadJson(
      `hub-backup-${new Date().toISOString().slice(0, 10)}.json`,
      payload,
    );
  };

  const runImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result as string);
        applyHubBackupPayload(data);
        window.location.reload();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Не вдалось імпортувати файл";
        toast.error(message);
      }
      e.target.value = "";
    };
    r.readAsText(f);
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-panelHi/40 px-3 py-2.5 flex flex-col gap-3 text-xs text-subtle",
        className,
      )}
    >
      <p className="font-semibold text-text leading-snug">
        Резервна копія всього Hub (Фінік, Фізрук, Рутина, останній модуль).
      </p>
      <p className="leading-relaxed text-xs">
        Токен Monobank і кеш транзакцій не входять у файл — після імпорту
        підключи рахунок знову в Фініку.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 min-h-[44px]"
          type="button"
          onClick={exportJson}
        >
          Експорт JSON
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 min-h-[44px]"
          type="button"
          onClick={() => fileRef.current?.click()}
        >
          Імпорт…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={runImport}
        />
      </div>
    </div>
  );
}
