/**
 * lib/db.js
 * Локальное хранилище истории расчётов на SQLite (через @tauri-apps/plugin-sql,
 * который использует sqlx и хранит файл в app data dir — это делает Tauri
 * автоматически через строку подключения "sqlite:smartprice.db").
 */
import Database from "@tauri-apps/plugin-sql";

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
        dedup_key
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT(dedup_key) DO UPDATE SET
        category = excluded.category,
        requested_markup = excluded.requested_markup,
        applied_markup = excluded.applied_markup,
        markup_limited = excluded.markup_limited,
        retail_price = excluded.retail_price,
        price_per_unit = excluded.price_per_unit,
        regulation_status = excluded.regulation_status,
        created_at = excluded.created_at
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
