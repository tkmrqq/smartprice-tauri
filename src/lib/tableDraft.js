/**
 * lib/tableDraft.js
 * Автосохранение текущей таблицы расчёта (в том числе ещё не
 * рассчитанной) и восстановление при следующем запуске.
 *
 * Хранится в localStorage webview: запись синхронная, поэтому её можно
 * надёжно доделать прямо в момент закрытия окна (в отличие от
 * асинхронного plugin-store). Пишем с небольшой задержкой после
 * последнего изменения и принудительно — при закрытии/сворачивании.
 */

const STORAGE_KEY = "smartprice.tableDraft.v1";
const SAVE_DELAY_MS = 400;
// Восстановленные строки получают id из диапазона, который не пересечётся
// со счётчиком новых строк в сторе (он начинается с 1).
const RESTORED_ID_BASE = 1_000_000_000;

const ROW_TEXT_FIELDS = [
  "name", "barcode", "purchasePrice", "weight", "unit", "supplierMarkup", "markup",
  "vat", "sortGrade", "country", "retailPrice", "pricePerUnit",
  "regulationStatus", "calcError", "prevPurchasePrice",
];

function isMeaningfulRow(row) {
  return Boolean(String(row.name ?? "").trim() || String(row.purchasePrice ?? "").trim());
}

/** Таблица с единственной пустой строкой сохранять не нужно. */
export function hasMeaningfulRows(rows) {
  return rows.some(isMeaningfulRow);
}

/** Приводит сырые данные из хранилища к безопасному виду строк таблицы. */
export function sanitizeRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r, index) => {
      const row = { id: RESTORED_ID_BASE + index };
      for (const field of ROW_TEXT_FIELDS) row[field] = String(r[field] ?? "");
      row.regulationCategory = r.regulationCategory ?? null;
      row.markupLimited = Boolean(r.markupLimited);
      row.markupPercentUnknown = Boolean(r.markupPercentUnknown);
      return row;
    });
}

export function serializeRows(rows) {
  return JSON.stringify({ savedAt: new Date().toISOString(), rows });
}

export function loadDraftRows(storage = globalThis.localStorage) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return [];
    return sanitizeRows(JSON.parse(text).rows);
  } catch {
    return [];
  }
}

export function clearDraft(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* хранилище недоступно — ничего страшного */
  }
}

function writeDraft(rows, storage) {
  try {
    if (hasMeaningfulRows(rows)) storage.setItem(STORAGE_KEY, serializeRows(rows));
    else storage.removeItem(STORAGE_KEY);
  } catch {
    /* переполнено/недоступно — автосохранение best-effort */
  }
}

let _started = false;

/**
 * Восстанавливает черновик в стор (только если таблица ещё пустая) и
 * подписывается на изменения. Безопасно вызывать повторно — сработает один раз.
 * @param {{rows: object[], $subscribe: Function}} store Pinia-стор товаров
 * @returns {number} сколько строк восстановлено
 */
export function setupTableDraft(store, storage = globalThis.localStorage) {
  if (_started || !storage) return 0;
  _started = true;

  let restored = 0;
  if (!hasMeaningfulRows(store.rows)) {
    const saved = loadDraftRows(storage);
    if (saved.length) {
      store.rows = saved;
      restored = saved.length;
    }
  }

  let timer = null;
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    writeDraft(store.rows, storage);
  };

  store.$subscribe(
    () => {
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    },
    { detached: true }
  );

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return restored;
}
