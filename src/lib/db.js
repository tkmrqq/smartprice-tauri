/**
 * lib/db.js
 * Локальное хранилище истории расчётов на SQLite (через @tauri-apps/plugin-sql,
 * который использует sqlx и хранит файл в app data dir — это делает Tauri
 * автоматически через строку подключения "sqlite:smartprice.db").
 */
import Database from "@tauri-apps/plugin-sql";
import { catalogKey } from "./catalog.js";
import { HISTORY_COLUMNS, CATALOG_COLUMNS } from "./backup.js";

let _db = null;

async function getDb() {
  if (!_db) {
    _db = await Database.load("sqlite:smartprice.db");
  }
  return _db;
}

/**
 * Создаёт таблицу истории, если её ещё нет, и накатывает недостающие столбцы
 * (аналог _ensure_column из Python — на случай обновления со старой версии БД).
 */
export async function initDb() {
  const db = await getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        purchase_price TEXT NOT NULL,
        weight_or_volume TEXT NOT NULL,
        requested_markup TEXT NOT NULL,
        applied_markup TEXT NOT NULL,
        markup_limited INTEGER NOT NULL,
        retail_price TEXT NOT NULL,
        price_per_unit TEXT NOT NULL,
        regulation_status TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
  `);

  const existingColumns = new Set(
    (await db.select("PRAGMA table_info(price_history)")).map((row) => row.name)
  );
  const columnsToAdd = [
    ["supplier_markup", "TEXT"],
    ["vat", "TEXT"],
    ["unit", "TEXT"],
    ["sort_grade", "TEXT"],
    ["country", "TEXT"],
    ["dedup_key", "TEXT"],
    ["barcode", "TEXT"],
  ];
  for (const [column, coltype] of columnsToAdd) {
    if (!existingColumns.has(column)) {
      await db.execute(`ALTER TABLE price_history ADD COLUMN ${column} ${coltype}`);
    }
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_price_history_name ON price_history (name)
  `);

  await migrateDedupKey(db);
  await initCatalog(db);
}

/**
 * Ключ "одинаковости" записи истории: если все эти поля совпадают с уже
 * сохранённой записью, считаем это тем же самым расчётом (обновляем его),
 * а не плодим новую строку. Специально НЕ включает retail_price/
 * price_per_unit/created_at — это производные/временные поля.
 * @param {object} record
 */
export function dedupKey(record) {
  const parts = [
    String(record.name ?? "").trim().toLowerCase(),
    String(record.purchasePrice ?? "").trim(),
    String(record.weightOrVolume ?? "1").trim(),
    String(record.supplierMarkup ?? "0").trim(),
    String(record.appliedMarkup ?? record.requestedMarkup ?? "").trim(),
    String(record.vat ?? "20").trim(),
    String(record.unit ?? "шт").trim().toLowerCase(),
    String(record.sortGrade ?? "").trim().toLowerCase(),
    String(record.country ?? "Беларусь").trim().toLowerCase(),
  ];
  return parts.join("|");
}

async function migrateDedupKey(db) {
  const rows = await db.select(
    "SELECT * FROM price_history WHERE dedup_key IS NULL OR dedup_key = ''"
  );
  for (const row of rows) {
    const key = dedupKey({
      name: row.name,
      purchasePrice: row.purchase_price,
      weightOrVolume: row.weight_or_volume,
      supplierMarkup: row.supplier_markup,
      appliedMarkup: row.applied_markup,
      vat: row.vat,
      unit: row.unit,
      sortGrade: row.sort_grade,
      country: row.country,
    });
    await db.execute("UPDATE price_history SET dedup_key = $1 WHERE id = $2", [key, row.id]);
  }

  // Схлопываем уже накопившиеся дубли, оставляя самую свежую запись по ключу.
  await db.execute(`
    DELETE FROM price_history
    WHERE id NOT IN (
        SELECT MAX(id) FROM price_history GROUP BY dedup_key
    )
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_price_history_dedup_key
    ON price_history (dedup_key)
  `);
}

/**
 * Сохраняет расчёт в историю. Если запись с таким же dedup_key уже
 * существует (тот же товар с теми же вводными), она ОБНОВЛЯЕТСЯ, а не
 * дублируется новой строкой — как в оригинальной Python-версии.
 * @param {object} record результат calculateBelarusPrice + weightOrVolume/sortGrade/country
 */
export async function saveCalculation(record) {
  const db = await getDb();
  const key = dedupKey(record);

  await db.execute(
    `
    INSERT INTO price_history (
        name, category, purchase_price, weight_or_volume,
        supplier_markup, vat, unit, sort_grade, country,
        requested_markup, applied_markup, markup_limited,
        retail_price, price_per_unit, regulation_status, created_at,
        dedup_key, barcode
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT(dedup_key) DO UPDATE SET
        category = excluded.category,
        requested_markup = excluded.requested_markup,
        applied_markup = excluded.applied_markup,
        markup_limited = excluded.markup_limited,
        retail_price = excluded.retail_price,
        price_per_unit = excluded.price_per_unit,
        regulation_status = excluded.regulation_status,
        created_at = excluded.created_at,
        barcode = COALESCE(NULLIF(excluded.barcode, ''), price_history.barcode)
    `,
    [
      record.name,
      record.category ?? null,
      String(record.purchasePrice),
      String(record.weightOrVolume ?? "1"),
      String(record.supplierMarkup ?? "0"),
      String(record.vat ?? "20"),
      String(record.unit ?? "шт"),
      record.sortGrade ?? "",
      record.country || "Беларусь",
      String(record.requestedMarkup),
      String(record.appliedMarkup),
      record.markupLimited ? 1 : 0,
      String(record.retailPrice),
      String(record.pricePerUnit),
      record.regulationStatus,
      new Date().toISOString().slice(0, 19),
      key,
      String(record.barcode ?? "").trim(),
    ]
  );
}

export async function getAllHistory(limit = 500) {
  const db = await getDb();
  return db.select("SELECT * FROM price_history ORDER BY id DESC LIMIT $1", [limit]);
}

export async function searchHistoryByName(query, limit = 20) {
  const queryLower = query.trim().toLowerCase();
  if (!queryLower) return [];
  const db = await getDb();
  const rows = await db.select("SELECT * FROM price_history ORDER BY id DESC");
  return rows.filter((row) => row.name.toLowerCase().includes(queryLower)).slice(0, limit);
}

export async function deleteEntry(entryId) {
  const db = await getDb();
  await db.execute("DELETE FROM price_history WHERE id = $1", [entryId]);
}

export async function clearHistory() {
  const db = await getDb();
  await db.execute("DELETE FROM price_history");
}


// ---------------------------------------------------------------------------
// Справочник товаров по штрихкоду (логика подстановки — в lib/catalog.js)
// ---------------------------------------------------------------------------

const CATALOG_EDITABLE_COLUMNS = [
  "name", "country", "unit", "weight", "vat", "sort_grade", "markup", "supplier_markup",
];

async function initCatalog(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS product_catalog (
        barcode TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT '',
        weight TEXT NOT NULL DEFAULT '',
        vat TEXT NOT NULL DEFAULT '',
        sort_grade TEXT NOT NULL DEFAULT '',
        markup TEXT NOT NULL DEFAULT '',
        supplier_markup TEXT NOT NULL DEFAULT '',
        last_purchase_price TEXT NOT NULL DEFAULT '',
        last_retail_price TEXT NOT NULL DEFAULT '',
        last_printed_retail TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
    )
  `);

  // Однократное заполнение из уже накопленной истории (там есть штрихкоды у
  // записей, сделанных после их появления). Версия схемы в user_version
  // нужна, чтобы не воскрешать товары, которые пользователь потом удалил.
  const versionRows = await db.select("PRAGMA user_version");
  const version = Number(versionRows?.[0]?.user_version ?? 0);
  if (version >= 1) return;

  const historyRows = await db.select(
    "SELECT * FROM price_history WHERE barcode IS NOT NULL AND TRIM(barcode) != '' ORDER BY id ASC"
  );
  const latestByKey = new Map();
  for (const row of historyRows) {
    const key = catalogKey(row.barcode);
    if (key) latestByKey.set(key, row); // при повторах остаётся самая свежая запись
  }
  for (const [key, row] of latestByKey) {
    await db.execute(
      `INSERT OR IGNORE INTO product_catalog (
          barcode, name, country, unit, weight, vat, sort_grade, markup, supplier_markup,
          last_purchase_price, last_retail_price, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        key, row.name, row.country ?? "", row.unit ?? "", row.weight_or_volume ?? "",
        row.vat ?? "", row.sort_grade ?? "", row.requested_markup ?? "", row.supplier_markup ?? "",
        row.purchase_price ?? "", row.retail_price ?? "", row.created_at ?? "",
      ]
    );
  }
  await db.execute("PRAGMA user_version = 1");
}

/**
 * Запоминает свойства товара и последние цены после расчёта.
 * @param {object} record результат buildCatalogRecord()
 */
export async function upsertCatalogFromCalculation(record) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO product_catalog (
        barcode, name, country, unit, weight, vat, sort_grade, markup, supplier_markup,
        last_purchase_price, last_retail_price, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT(barcode) DO UPDATE SET
        name = excluded.name,
        country = excluded.country,
        unit = excluded.unit,
        weight = excluded.weight,
        vat = excluded.vat,
        sort_grade = excluded.sort_grade,
        markup = excluded.markup,
        supplier_markup = excluded.supplier_markup,
        last_purchase_price = excluded.last_purchase_price,
        last_retail_price = excluded.last_retail_price,
        updated_at = excluded.updated_at`,
    [
      record.barcode, record.name, record.country, record.unit, record.weight, record.vat,
      record.sortGrade, record.markup, record.supplierMarkup, record.purchasePrice,
      record.retailPrice, new Date().toISOString().slice(0, 19),
    ]
  );
}

/** @returns {Promise<Map<string, object>>} ключ (цифры штрихкода) -> запись справочника */
export async function getCatalogByBarcodes(keys) {
  const unique = [...new Set(keys.filter(Boolean))];
  const result = new Map();
  if (!unique.length) return result;

  const db = await getDb();
  const CHUNK = 400; // с запасом под лимит параметров SQLite
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, j) => `$${j + 1}`).join(", ");
    const rows = await db.select(`SELECT * FROM product_catalog WHERE barcode IN (${placeholders})`, chunk);
    for (const row of rows) result.set(row.barcode, row);
  }
  return result;
}

/** Поиск делаем в JS: LOWER() в SQLite не понимает регистр кириллицы. */
export async function listCatalog(query = "", limit = 1000) {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM product_catalog ORDER BY updated_at DESC, name ASC");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.barcode.includes(q))
    : rows;
  return filtered.slice(0, limit);
}

/** Ручная правка свойств товара (цены не трогаем). */
export async function saveCatalogEdit(barcode, fields) {
  const db = await getDb();
  const assignments = CATALOG_EDITABLE_COLUMNS.map((col, i) => `${col} = $${i + 2}`).join(", ");
  await db.execute(`UPDATE product_catalog SET ${assignments} WHERE barcode = $1`, [
    barcode,
    ...CATALOG_EDITABLE_COLUMNS.map((col) => String(fields[col] ?? "").trim()),
  ]);
}

export async function deleteCatalogEntry(barcode) {
  const db = await getDb();
  await db.execute("DELETE FROM product_catalog WHERE barcode = $1", [barcode]);
}

/** Запоминает, по какой цене товар в последний раз попал на ценник. */
export async function markLabelsPrinted(items) {
  const db = await getDb();
  for (const item of items) {
    const key = catalogKey(item.barcode);
    if (!key) continue;
    await db.execute("UPDATE product_catalog SET last_printed_retail = $2 WHERE barcode = $1", [
      key,
      String(item.retailPrice),
    ]);
  }
}


// ---------------------------------------------------------------------------
// Резервная копия: выгрузка и слияние (формат файла — в lib/backup.js)
// ---------------------------------------------------------------------------

/** Все данные для копии "как есть"; лишние колонки (id) отбрасывает buildBackup. */
export async function exportAllData() {
  const db = await getDb();
  const priceHistory = await db.select("SELECT * FROM price_history ORDER BY id ASC");
  const productCatalog = await db.select("SELECT * FROM product_catalog ORDER BY barcode ASC");
  return { priceHistory, productCatalog };
}

const placeholders = (count) => Array.from({ length: count }, (_, i) => `$${i + 1}`).join(", ");

/**
 * Сливает данные копии с текущими — ничего не удаляя, поэтому повторное
 * восстановление безопасно:
 *  - история: запись с таким же dedup_key уже есть — остаётся текущая;
 *  - справочник: запись из копии заменяет текущую, только если она не старше.
 * @returns {Promise<{historyAdded: number, historySkipped: number, catalogUpdated: number}>}
 */
export async function importBackupData({ priceHistory, productCatalog }) {
  const db = await getDb();

  const historySql = `INSERT OR IGNORE INTO price_history (${HISTORY_COLUMNS.join(", ")})
                      VALUES (${placeholders(HISTORY_COLUMNS.length)})`;
  let historyAdded = 0;
  for (const row of priceHistory) {
    const dedup =
      row.dedup_key ||
      dedupKey({
        name: row.name,
        purchasePrice: row.purchase_price,
        weightOrVolume: row.weight_or_volume,
        supplierMarkup: row.supplier_markup,
        appliedMarkup: row.applied_markup,
        vat: row.vat,
        unit: row.unit,
        sortGrade: row.sort_grade,
        country: row.country,
      });
    const values = HISTORY_COLUMNS.map((column) => (column === "dedup_key" ? dedup : row[column]));
    const result = await db.execute(historySql, values);
    historyAdded += Number(result?.rowsAffected ?? 0);
  }

  const updatable = CATALOG_COLUMNS.filter((column) => column !== "barcode");
  const catalogSql = `INSERT INTO product_catalog (${CATALOG_COLUMNS.join(", ")})
                      VALUES (${placeholders(CATALOG_COLUMNS.length)})
                      ON CONFLICT(barcode) DO UPDATE SET
                        ${updatable.map((column) => `${column} = excluded.${column}`).join(", ")}
                      WHERE excluded.updated_at >= product_catalog.updated_at`;
  let catalogUpdated = 0;
  for (const row of productCatalog) {
    const result = await db.execute(catalogSql, CATALOG_COLUMNS.map((column) => row[column]));
    catalogUpdated += Number(result?.rowsAffected ?? 0);
  }

  return { historyAdded, historySkipped: priceHistory.length - historyAdded, catalogUpdated };
}
