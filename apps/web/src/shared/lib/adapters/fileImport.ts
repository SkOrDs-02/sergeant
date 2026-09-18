/**
 * Web adapter for the shared file-import contract.
 *
 * Creates a hidden `<input type="file" accept=".json">` element, waits
 * for the user to pick a file, reads it via `FileReader`, and returns
 * the parsed JSON payload. Returns `null` if the user cancels.
 *
 * Importing this module has the side-effect of registering the web
 * adapter, so the side-effect import in `apps/web/src/main.tsx` is all
 * the app shell needs.
 */

import { setFileImportAdapter, type FileImportAdapter } from "@sergeant/shared";

export const webFileImportAdapter: FileImportAdapter = {
  pickJson() {
    if (typeof document === "undefined") {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";

      const cleanup = () => {
        input.remove();
      };

      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) {
          cleanup();
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result as string);
            resolve({ filename: file.name, data });
          } catch {
            resolve(null);
          }
          cleanup();
        };
        reader.onerror = () => {
          cleanup();
          resolve(null);
        };
        reader.readAsText(file);
      });

      input.addEventListener("cancel", () => {
        cleanup();
        resolve(null);
      });

      input.click();
    });
  },
};

setFileImportAdapter(webFileImportAdapter);
