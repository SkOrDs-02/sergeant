import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
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
              console.log("[sw] snapshot", snap);
              toast.success("SW-діагностика виведена в консоль");
            } catch (err) {
              toast.error("Не вдалося отримати діагностику SW");
              console.warn("[sw] debug failed", err);
            } finally {
              setSwBusy(false);
            }
          }}
        >
          Діагностика SW
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 flex-1"
          disabled={swBusy || !("serviceWorker" in navigator)}
          onClick={async () => {
            setSwBusy(true);
            try {
              const res = await swClearCaches();
              console.log("[sw] caches cleared", res);
              toast.success("Кеш PWA скинуто. Перезавантажуємо…", 4000);
              setTimeout(() => window.location.reload(), 300);
            } catch (err) {
              toast.error("Не вдалося скинути кеш PWA");
              console.warn("[sw] clear caches failed", err);
            } finally {
              setSwBusy(false);
            }
          }}
        >
          Скинути кеш PWA
        </Button>
      </div>
    </SettingsGroup>
  );
}
