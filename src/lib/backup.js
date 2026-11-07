/**
 * lib/backup.js
 * Резервная копия данных приложения в один JSON-файл: история расчётов,
 * справочник товаров и настройки. Здесь только чистая логика (сборка,
 * проверка, сводка, график напоминаний); чтение и запись файлов и БД —
 * в lib/backupFlow.js и lib/db.js.
 *
 * Почему JSON, а не копия файла базы: SQLite открыта пулом соединений, копия
 * «на лету» может оказаться неконсистентной, а подменить живую базу без
 * перезапуска приложения нельзя. JSON не зависит от внутренней схемы и
 * переносится на другой компьютер.
 */
import { catalogKey } from "./catalog.js";

export const BACKUP_APP = "SmartPrice-BY";
export const BACKUP_FORMAT = 1;
export const BACKUP_REMINDER_DAYS = 7;

export const HISTORY_COLUMNS = [
  "name", "category", "purchase_price", "weight_or_volume", "supplier_markup", "vat", "unit",
  "sort_grade", "country", "requested_markup", "applied_markup", "markup_limited", "retail_price",
  "price_per_unit", "regulation_status", "created_at", "dedup_key", "barcode",
];

export const CATALOG_COLUMNS = [
  "barcode", "name", "country", "unit", "weight", "vat", "sort_grade", "markup", "supplier_markup",
  "last_purchase_price", "last_retail_price", "last_printed_retail", "updated_at",
];

const text = (value) => String(value ?? "").trim();

/** Строка истории -> безопасный вид; null, если без обязательных полей её не восстановить. */
function sanitizeHistoryRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const row = {};
  for (const column of HISTORY_COLUMNS) row[column] = text(raw[column]);
  row.markup_limited = Number(raw.markup_limited) ? 1 : 0;
  row.category = raw.category == null ? null : text(raw.category);

  const required = ["name", "purchase_price", "retail_price", "created_at"];
  return required.every((column) => row[column] !== "") ? row : null;
}

function sanitizeCatalogRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const barcode = catalogKey(raw.barcode);
  if (!barcode) return null;
  const row = {};
  for (const column of CATALOG_COLUMNS) row[column] = text(raw[column]);
  row.barcode = barcode;
  return row;
}

function sanitizeSettings(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  if (typeof raw.companyName === "string") out.companyName = raw.companyName.trim();
  if (typeof raw.companyUnp === "string") out.companyUnp = raw.companyUnp.trim();
  if (typeof raw.printBarcode === "boolean") out.printBarcode = raw.printBarcode;
  if (typeof raw.visionApiKey === "string" && raw.visionApiKey.trim()) out.visionApiKey = raw.visionApiKey.trim();
  if (raw.regulatedCategories && Array.isArray(raw.regulatedCategories.categories)) {
    out.regulatedCategories = raw.regulatedCategories;
  }
  return out;
}

/**
 * @param {{priceHistory: object[], productCatalog: object[], settings?: object, createdAt?: string, appVersion?: string}} input
 */
export function buildBackup({ priceHistory, productCatalog, settings = {}, createdAt, appVersion = "" }) {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    createdAt: createdAt ?? new Date().toISOString(),
    appVersion,
    data: {
      priceHistory: priceHistory.map(sanitizeHistoryRow).filter(Boolean),
      productCatalog: productCatalog.map(sanitizeCatalogRow).filter(Boolean),
      settings: sanitizeSettings(settings),
    },
  };
}

export function serializeBackup(backup) {
  return JSON.stringify(backup);
}

export class BackupError extends Error {}

/**
 * Разбирает и проверяет текст файла копии. Битые строки не роняют импорт —
 * они пропускаются и считаются в skipped.
 * @returns {{createdAt: string, appVersion: string, priceHistory: object[], productCatalog: object[], settings: object, skipped: number}}
 */
export function parseBackup(fileText) {
  let parsed;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new BackupError("Файл не похож на резервную копию SmartPrice: это не корректный JSON.");
  }
  if (!parsed || parsed.app !== BACKUP_APP) {
    throw new BackupError("Это не резервная копия SmartPrice-BY.");
  }
  if (!Number.isInteger(parsed.format) || parsed.format > BACKUP_FORMAT) {
    throw new BackupError("Копия создана более новой версией приложения. Обновите программу и повторите.");
  }
  const data = parsed.data;
  if (!data || !Array.isArray(data.priceHistory) || !Array.isArray(data.productCatalog)) {
    throw new BackupError("В файле нет данных истории и справочника — файл повреждён.");
  }

  const priceHistory = data.priceHistory.map(sanitizeHistoryRow).filter(Boolean);
  const productCatalog = data.productCatalog.map(sanitizeCatalogRow).filter(Boolean);
  const skipped =
    data.priceHistory.length - priceHistory.length + (data.productCatalog.length - productCatalog.length);

  return {
    createdAt: text(parsed.createdAt),
    appVersion: text(parsed.appVersion),
    priceHistory,
    productCatalog,
    settings: sanitizeSettings(data.settings),
    skipped,
  };
}

/** Текст для окна подтверждения перед восстановлением. */
export function describeBackup(backup) {
  const created = backup.createdAt ? new Date(backup.createdAt) : null;
  const when = created && !Number.isNaN(created.getTime()) ? created.toLocaleString("ru-RU") : "дата неизвестна";
  const lines = [
    `Копия от ${when}:`,
    `• записей истории: ${backup.priceHistory.length}`,
    `• товаров в справочнике: ${backup.productCatalog.length}`,
    `• настройки: ${Object.keys(backup.settings).length ? "да" : "нет"}`,
  ];
  if (backup.settings.visionApiKey) lines.push("• в копии есть ключ Google Vision API");
  if (backup.skipped) lines.push(`• повреждённых строк пропущено: ${backup.skipped}`);
  return lines.join("\n");
}

export function backupFileName(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `smartprice-backup-${date.getFullYear()}-${mm}-${dd}.json`;
}

/**
 * Пора ли напомнить о копии: с последней копии (а если её не было — с первого
 * запуска) прошло не меньше days суток. Так в первую неделю напоминание не
 * надоедает.
 */
export function isBackupDue(lastBackupAt, firstRunAt, now = new Date(), days = BACKUP_REMINDER_DAYS) {
  const baselineText = text(lastBackupAt) || text(firstRunAt);
  if (!baselineText) return false;
  const baseline = new Date(baselineText);
  if (Number.isNaN(baseline.getTime())) return false;
  return now.getTime() - baseline.getTime() >= days * 24 * 60 * 60 * 1000;
}
