/**
 * lib/priceListParser.js
 * Прайс-листы поставщиков приходят в совершенно разных форматах: шапка
 * может быть на 1-й строке или на 8-й, колонки в разном порядке, часть
 * строк — не товары, а заголовки категорий ("Категория «Шоколад»") или
 * реквизиты компании. Модуль не предполагает жёсткого формата — он ищет
 * "похожую на шапку" строку по ключевым словам, а дальше пользователь
 * может поправить сопоставление руками (см. PriceCompareView.vue).
 */
import * as XLSX from "xlsx";
import * as cptable from "xlsx/dist/cpexcel.full.mjs";

// Браузерная/бандленная сборка SheetJS (то, что реально попадает в Tauri
// через Vite) не включает таблицы кодовых страниц по умолчанию — ради
// размера бандла. Без них старые .xls (BIFF8), где кириллица хранится не
// в UTF-16, а однобайтно с явной кодовой страницей (обычно Windows-1251 —
// см. поле CodePage в самом файле), читаются как мойбейк: каждый байт
// трактуется как Latin-1. .xlsx этой проблемы не касается — там текст
// всегда в UTF-8 внутри XML.
//
// В сборке для Node (используется в тестах — see readWorkbook() тестах)
// резолвится другая, CJS-сборка пакета, которая уже подключает таблицы
// кодовых страниц сама при загрузке и НЕ экспортирует set_cptable вообще —
// поэтому вызываем его только если функция реально есть.
if (typeof XLSX.set_cptable === "function") {
  XLSX.set_cptable(cptable);
}

const HEADER_KEYWORDS_STRONG = {
  barcode: ["штрихкод", "штрих-код", "штрих код", "barcode", "ean"],
  name: ["наименование товара", "наименование", "название"],
  priceNoVat: ["без ндс", "цена без ндс", "базовая цена", "цена, без ндс"],
  priceWithVat: ["с ндс", "цена с ндс", "цена, с ндс"],
  vatRate: ["ставка ндс", "% ндс", "ндс, %", "ставка, ндс"],
  packQty: ["кратность", "кол-во в блоке", "количество в грузовом месте", "шт. в блоке", "кол-во шт"],
  weight: ["вес", "масса"],
  country: ["страна", "страна изготовления", "страна происхождения"],
};

// Общие однословные признаки — используются только вторым проходом, для
// колонок, которые не нашлись по точным фразам. Без этого разделения
// слово "товар" ловит на себя, например, "Внешний код товара" раньше,
// чем добирается до настоящей колонки "Наименование товара".
const HEADER_KEYWORDS_WEAK = {
  name: ["товар"],
};

// Порядок важен: если ячейка подходит под несколько колонок сразу
// (напр. "Цена без НДС" содержит и "цена", и "без ндс"), берём наиболее
// специфичную первой.
const FIELD_PRIORITY = ["priceNoVat", "priceWithVat", "barcode", "name", "vatRate", "packQty", "weight", "country"];

function cellText(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Читает файл (ArrayBuffer) и возвращает "сырую" сетку первого листа
 * с данными (array-of-arrays), плюс список всех листов на случай, если
 * данные не на первом.
 * @param {ArrayBuffer} arrayBuffer
 */
export function readWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  const sheetNames = workbook.SheetNames;

  const sheets = sheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
    return { name, rows };
  });

  // Эвристика выбора листа по умолчанию: тот, где больше всего непустых
  // ячеек (прайс обычно на самом "тяжёлом" листе, а не на служебном).
  const bestSheet = sheets.reduce((best, s) => {
    const density = s.rows.reduce((acc, row) => acc + row.filter((c) => c !== "").length, 0);
    return density > (best?.density ?? -1) ? { ...s, density } : best;
  }, null);

  return { sheetNames, sheets, defaultSheetName: bestSheet?.name ?? sheetNames[0] };
}

/**
 * Ищет строку-шапку и сопоставление колонок в пределах первых maxScanRows
 * строк. Возвращает null для полей, которые не удалось уверенно найти —
 * их нужно будет доопределить руками в UI.
 * @param {any[][]} rows
 */
export function detectColumnMapping(rows, maxScanRows = 40) {
  let bestRow = -1;
  let bestScore = 0;
  let bestMapping = {};

  const scanLimit = Math.min(maxScanRows, rows.length);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;

    const mapping = {};
    let score = 0;

    // Проход 1: только точные/специфичные фразы, по всей строке. Идёт
    // раньше общих однословных признаков, чтобы специфичная колонка
    // "Наименование товара" не досталась случайно более ранней ячейке
    // вроде "Внешний код товара".
    for (let c = 0; c < row.length; c++) {
      const text = cellText(row[c]);
      if (!text) continue;
      for (const field of FIELD_PRIORITY) {
        if (field in mapping) continue;
        const keywords = HEADER_KEYWORDS_STRONG[field];
        if (keywords.some((kw) => text.includes(kw))) {
          mapping[field] = c;
          score += 1;
          break;
        }
      }
    }

    // Проход 2: общие слова — только для полей, которые проход 1 не нашёл.
    for (let c = 0; c < row.length; c++) {
      const text = cellText(row[c]);
      if (!text) continue;
      for (const field of FIELD_PRIORITY) {
        if (field in mapping) continue;
        const keywords = HEADER_KEYWORDS_WEAK[field];
        if (keywords && keywords.some((kw) => text.includes(kw))) {
          mapping[field] = c;
          score += 1;
          break;
        }
      }
    }

    // Хорошая шапка обычно содержит хотя бы name + одну из цен.
    const hasEssentials = "name" in mapping && ("priceNoVat" in mapping || "priceWithVat" in mapping);
    if (hasEssentials && score > bestScore) {
      bestScore = score;
      bestRow = r;
      bestMapping = mapping;
    }
  }

  return {
    headerRowIndex: bestRow,
    columns: bestMapping,
    confidence: bestRow === -1 ? 0 : bestScore,
  };
}

function toNumber(value) {
  if (value === "" || value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(",", ".").replace(/\s/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Превращает сырые строки в список товаров по заданному сопоставлению
 * колонок. Строка считается товаром, если в ней есть непустое название
 * И положительная цена в выбранной колонке цены — это естественным
 * образом отфильтровывает строки-категории ("Категория «Шоколад»",
 * цена = 0/пусто) и служебные строки реквизитов.
 *
 * @param {any[][]} rows
 * @param {number} headerRowIndex
 * @param {{barcode?:number, name:number, priceColumn:number, priceWithVat?:number, vatRate?:number, packQty?:number, country?:number}} columns
 *   priceColumn — какую именно колонку использовать как цену для сравнения
 *   (обычно "без НДС", но пользователь может выбрать любую).
 */
export function extractProducts(rows, headerRowIndex, columns) {
  const products = [];
  const start = headerRowIndex + 1;

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;

    const rawName = row[columns.name];
    const name = String(rawName ?? "").trim();
    if (!name) continue;

    const price = toNumber(row[columns.priceColumn]);
    if (price == null || price <= 0) continue;

    const barcode = columns.barcode != null ? String(row[columns.barcode] ?? "").trim() : "";
    const vatRate = columns.vatRate != null ? toNumber(row[columns.vatRate]) : null;
    const packQty = columns.packQty != null ? toNumber(row[columns.packQty]) : null;
    const country = columns.country != null ? String(row[columns.country] ?? "").trim() : "";

    products.push({ name, price, barcode, vatRate, packQty, country, sourceRow: r });
  }

  return products;
}