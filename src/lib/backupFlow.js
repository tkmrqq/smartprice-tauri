/**
 * lib/backupFlow.js
 * Сохранение и восстановление резервной копии: диалоги выбора файла, чтение и
 * запись, обращение к БД и настройкам. Формат и проверка файла — lib/backup.js.
 */
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { exportAllData, importBackupData } from "./db.js";
import { buildBackup, serializeBackup, parseBackup, backupFileName } from "./backup.js";
import { useSettingsStore } from "../stores/settings.js";

async function appVersionOrEmpty() {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return ""; // версия нужна только для справки, без неё копия остаётся рабочей
  }
}

/**
 * Спрашивает, куда сохранить, и записывает копию.
 * @returns {Promise<{cancelled: true} | {cancelled: false, path: string, historyCount: number, catalogCount: number}>}
 */
export async function saveBackupToFile({ includeVisionKey = false } = {}) {
  const path = await save({
    title: "Сохранить резервную копию",
    defaultPath: backupFileName(new Date()),
    filters: [{ name: "Резервная копия SmartPrice", extensions: ["json"] }],
  });
  if (!path) return { cancelled: true };

  const settings = useSettingsStore();
  const data = await exportAllData();
  const backup = buildBackup({
    ...data,
    settings: await settings.exportSnapshot({ includeVisionKey }),
    appVersion: await appVersionOrEmpty(),
  });

  await writeTextFile(path, serializeBackup(backup));
  await settings.markBackupDone();

  return {
    cancelled: false,
    path,
    historyCount: backup.data.priceHistory.length,
    catalogCount: backup.data.productCatalog.length,
  };
}

/**
 * Шаг 1 восстановления: выбрать файл, прочитать и проверить. Ничего не
 * меняет — результат показывают пользователю на подтверждение.
 * @returns {Promise<{cancelled: true} | {cancelled: false, path: string, backup: object}>}
 */
export async function readBackupFromFile() {
  const path = await open({
    title: "Выберите резервную копию",
    filters: [{ name: "Резервная копия SmartPrice", extensions: ["json"] }],
    multiple: false,
  });
  if (!path) return { cancelled: true };

  const backup = parseBackup(await readTextFile(path)); // бросает BackupError с понятным текстом
  return { cancelled: false, path, backup };
}

/**
 * Шаг 2: применить проверенную копию (слияние с текущими данными).
 * @returns {Promise<{historyAdded: number, historySkipped: number, catalogUpdated: number}>}
 */
export async function applyBackup(backup) {
  const counts = await importBackupData(backup);
  if (Object.keys(backup.settings).length) {
    await useSettingsStore().importSnapshot(backup.settings);
  }
  return counts;
}
