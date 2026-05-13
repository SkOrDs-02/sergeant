import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { logger } from "@shared/lib";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { useToast } from "@shared/hooks/useToast";
import {
  swClearCaches,
  swGetDebugSnapshot,
  swSetDebug,
} from "../app/swControl";
import { SettingsGroup } from "./SettingsPrimitives";

export function PWASection() {
  const toast = useToast();
  const [swBusy, setSwBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const performClearCaches = async () => {
    setConfirmOpen(false);
    setSwBusy(true);
    try {
      const res = await swClearCaches();
      logger.info("[sw] caches cleared", res);
      toast.success("Кеш PWA скинуто. Перезавантажуємо…", 4000);
      setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      toast.error("Не вдалося скинути кеш PWA");
      logger.warn("[sw] clear caches failed", err);
    } finally {
      setSwBusy(false);
    }
  };

  return (
    <SettingsGroup title="PWA та офлайн" emoji="📡">
      <p className="text-xs text-subtle leading-snug">
        Якщо після оновлення щось «застрягло» (стара версія або дивні дані),
        можна скинути кеш Service Worker і перезавантажити застосунок.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 flex-1"
          disabled={swBusy || !("serviceWorker" in navigator)}
          onClick={async () => {
            setSwBusy(true);
            try {
              await swSetDebug(true);
              const snap = await swGetDebugSnapshot();
              logger.info("[sw] snapshot", snap);
              toast.success("SW-діагностика виведена в консоль");
            } catch (err) {
              toast.error("Не вдалося отримати діагностику SW");
              logger.warn("[sw] debug failed", err);
            } finally {
              setSwBusy(false);
            }
          }}
        >
          Діагностика SW
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="h-10 flex-1"
          disabled={swBusy || !("serviceWorker" in navigator)}
          onClick={() => setConfirmOpen(true)}
        >
          Скинути кеш PWA
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Скинути кеш PWA?"
        description="Service Worker очистить локальні кеші, після чого сторінка перезавантажиться. Несинхронізовані зміни в офлайн-черзі можуть бути втрачені."
        confirmLabel="Скинути та перезавантажити"
        cancelLabel="Скасувати"
        danger
        onConfirm={performClearCaches}
        onCancel={() => setConfirmOpen(false)}
      />
    </SettingsGroup>
  );
}
