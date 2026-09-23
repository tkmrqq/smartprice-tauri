import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask, message } from "@tauri-apps/plugin-dialog";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function readAppVersion() {
  if (!isTauriRuntime()) return import.meta.env.VITE_APP_VERSION ?? "—";
  try {
    return await getVersion();
  } catch {
    return "—";
  }
}

/**
 * @param {{ silent?: boolean, onProgress?: (percent: number|null) => void }} [options]
 * @returns {Promise<{ status: string, version?: string, error?: string }>}
 */
export async function checkForUpdates(options = {}) {
  const { silent = false, onProgress } = options;

  if (!isTauriRuntime()) {
    return { status: "unsupported" };
  }

  if (import.meta.env.DEV) {
    if (!silent) return { status: "dev" };
    return { status: "skipped" };
  }

  try {
    const update = await check();
    if (!update) {
      if (!silent) {
        await message("У вас установлена последняя версия.", { title: "Обновления", kind: "info" });
      }
      return { status: "latest" };
    }

    const notes = update.body?.trim();
    const prompt = notes
      ? `Доступна версия ${update.version}.\n\n${notes}\n\nУстановить сейчас?`
      : `Доступна новая версия ${update.version}. Установить сейчас?`;

    const agreed = await ask(prompt, { title: "Обновление SmartPrice-РБ", kind: "info" });
    if (!agreed) return { status: "declined", version: update.version };

    let downloaded = 0;
    let total = 0;
    onProgress?.(null);

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
        onProgress?.(0);
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        if (total > 0) onProgress?.(Math.min(100, Math.round((downloaded / total) * 100)));
      } else if (event.event === "Finished") {
        onProgress?.(100);
      }
    });

    await relaunch();
    return { status: "installed", version: update.version };
  } catch (e) {
    const error = String(e?.message || e);
    if (!silent) {
      await message(`Не удалось проверить обновления:\n${error}`, {
        title: "Обновления",
        kind: "error",
      });
    }
    return { status: "error", error };
  }
}
