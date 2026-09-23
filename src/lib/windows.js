/**
 * lib/windows.js
 * Открытие редактора категорий регулирования в отдельном нативном окне
 * Tauri (не модалка внутри главного окна) — удобно держать открытым рядом
 * с основной таблицей на втором мониторе.
 */
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const REGULATED_ITEMS_WINDOW_LABEL = "regulated-items";
export const REGULATED_ITEMS_UPDATED_EVENT = "regulated-items-updated";

export async function openRegulatedItemsWindow() {
  const existing = await WebviewWindow.getByLabel(REGULATED_ITEMS_WINDOW_LABEL);
  if (existing) {
    await existing.setFocus();
    return existing;
  }

  const win = new WebviewWindow(REGULATED_ITEMS_WINDOW_LABEL, {
    url: "index.html#/regulated-items",
    title: "Категории регулирования — SmartPrice-РБ",
    width: 880,
    height: 640,
    minWidth: 680,
    minHeight: 420,
    resizable: true,
    center: true,
  });

  win.once("tauri://error", (event) => {
    console.error("Не удалось открыть окно редактора категорий:", event);
  });

  return win;
}
