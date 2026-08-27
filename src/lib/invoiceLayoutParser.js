/**
 * lib/invoiceLayoutParser.js
 * Раскладка распознанных текстовых блоков (с координатами) в список товаров
 * накладной: наименование / цена / вес / кол-во.
 *
 * Не зависит от конкретного OCR-движка. Используется вместе с
 * lib/visionOcr.js (Google Cloud Vision).
 *
 * Формат входных блоков (массив объектов):
 *   {
 *     xLeft, xRight, xCenter,
 *     yTop, yBottom, yCenter,
 *     height,
 *     text,
 *     confidence, // 0..1
 *   }
 */

const PRICE_PATTERN = /\d+[.,]\d{2}/;
const WEIGHT_PATTERN = /(\d+[.,]?\d*)\s*(кг|г|л|мл)(?![a-zA-Zа-яёА-ЯЁ0-9])/i;
const COLUMN_NUMBER_RE = /^[1-9]\d?$/;
const PRODUCT_CODE_RE = /^\d+(?:\s+\d+)*$/;
const VAT_RATE_RE = /^20([.,]00)?$/;
const UNIT_ONLY_RE = /^(шт|штук|шt|уп|упак|пач|кг|г|л|мл)\.?$/i;
const IGNORE_NAME_TOKENS = /^(руб|руб\.|коп|коп\.|ндс|ставк|сумма|стоимост|цена|итого|всего|%|проц|сумма\s*ндс)$/i;
const SKIP_ROW_KEYWORDS = [
  "итого", "всего", "подпись", "свидетельство", "страниц",
  "передано", "получено", "накладная", "унп", "р/с",
];
export const MIN_CONFIDENCE = 0.2;

const HEADER_KEYWORDS = {
  name: ["наимен", "наименование", "наименование товара"],
  unit: ["единиц", "ед.", "ед.изм", "ед изм", "единица", "единиц/изм"],
  qty: ["количеств", "кол-во", "кол ", "колич", "кол"],
  price: ["цена", "цена,"],
  cost: ["стоимост", "стоимость"],
  vat_sum: ["сумма", "сумма ндс", "сумма,"],
};

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Группирует блоки в строки по вертикальной координате.
 * @param {object[]} blocks
 */
function groupIntoRows(blocks) {
  const heights = blocks.map((b) => b.height).filter((h) => h > 0);
  const medianHeight = heights.length ? median(heights) : 20;
  const rowThreshold = Math.max(medianHeight * 1.3, 12.0);

  const sorted = [...blocks].sort((a, b) => a.yCenter - b.yCenter);
  const rows = [];
  let currentRow = [];
  let currentY = null;

  for (const block of sorted) {
    if (currentRow.length && Math.abs(block.yCenter - currentY) > rowThreshold) {
      rows.push(currentRow);
      currentRow = [block];
      currentY = block.yCenter;
    } else {
      currentRow.push(block);
      currentY = mean(currentRow.map((item) => item.yCenter));
    }
  }
  if (currentRow.length) rows.push(currentRow);
  return rows;
}

/**
 * Ищет x-координаты колонок по словам в шапке накладной.
 * @param {object[]} blocks
 */
function detectHeaderColumns(blocks) {
  if (!blocks.length) return {};
  const pageBottom = Math.max(...blocks.map((b) => b.yBottom));
  const headerZone = pageBottom * 0.4;

  const found = {};
  const sortedByTop = [...blocks].sort((a, b) => a.yTop - b.yTop);
  for (const block of sortedByTop) {
    if (block.yTop > headerZone) break;
    const textLower = block.text.toLowerCase();
    for (const [col, keywords] of Object.entries(HEADER_KEYWORDS)) {
      if (col in found) continue;
      if (keywords.some((kw) => textLower.includes(kw))) {
        found[col] = block.xCenter;
      }
    }
  }
  return found;
}

function nameBoundaryX(columns, maxX) {
  const otherCols = Object.entries(columns)
    .filter(([col]) => col !== "name")
    .map(([, x]) => x);
  if (!otherCols.length) return maxX * 0.65;

  let boundary = Math.min(...otherCols);
  if (boundary < maxX * 0.25) return maxX * 0.65;

  const nameX = columns.name;
  if (nameX != null && nameX < boundary) {
    boundary -= (boundary - nameX) * 0.15;
  }
  return boundary;
}

function isProductCode(block, maxX) {
  const digitsOnly = block.text.trim().replace(/\D/g, "");
  if (!digitsOnly) return false;
  if (digitsOnly.length < 3 || digitsOnly.length > 12) return false;
  return block.xCenter < maxX * 0.22;
}

function isNameColumn(block, boundaryX) {
  return block.xCenter < boundaryX;
}

function isColumnIndexRow(row) {
  const texts = [...row].sort((a, b) => a.xLeft - b.xLeft).map((b) => b.text.trim());
  if (texts.length < 3) return false;
  if (!texts.every((t) => COLUMN_NUMBER_RE.test(t))) return false;
  const nums = texts.map((t) => Number.parseInt(t, 10));
  if (![1, 2].includes(nums[0])) return false;
  return nums.every((n, i) => n === nums[0] + i);
}

function isSkipRow(rowText) {
  const lower = rowText.toLowerCase();
  return SKIP_ROW_KEYWORDS.some((kw) => lower.includes(kw));
}

function looksLikeNameText(rawText) {
  const t = rawText.trim();
  if (!t) return false;
  if (UNIT_ONLY_RE.test(t)) return false;
  if (IGNORE_NAME_TOKENS.test(t)) return false;
  if (VAT_RATE_RE.test(t.replace(/\s/g, ""))) return false;
  if (COLUMN_NUMBER_RE.test(t)) return false;
  const hasLetters = /\p{L}/u.test(t);
  return hasLetters || t.length >= 3;
}

function parsePrice(rawText) {
  const match = PRICE_PATTERN.exec(rawText.replace(/\s/g, ""));
  if (!match) return null;
  const value = Number.parseFloat(match[0].replace(",", "."));
  return Number.isNaN(value) ? null : value;
}

function parseWeight(rawText) {
  const match = WEIGHT_PATTERN.exec(rawText.toLowerCase().replace(/,/g, "."));
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(",", "."));
  if (Number.isNaN(value)) return null;
  const unit = match[2].toLowerCase();
  return unit === "г" || unit === "мл" ? Math.round((value / 1000) * 1e6) / 1e6 : value;
}

/** @returns {[number, number][]} пары [цена, xCenter] */
function extractRowPrices(row) {
  const prices = [];
  for (const block of row) {
    const normalized = block.text.replace(/\s/g, "");
    if (VAT_RATE_RE.test(normalized)) continue;
    const price = parsePrice(block.text);
    if (price != null) prices.push([price, block.xCenter]);
  }
  prices.sort((a, b) => a[1] - b[1]);
  return prices;
}

function selectPriceForRow(rowPrices, priceX) {
  if (!rowPrices.length) return null;
  if (priceX == null) return rowPrices[0][0];
  let best = rowPrices[0];
  let bestDist = Math.abs(best[1] - priceX);
  for (const candidate of rowPrices.slice(1)) {
    const dist = Math.abs(candidate[1] - priceX);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best[0];
}

function selectQtyForRow(row, qtyX, maxX) {
  const candidates = row
    .filter((b) => /^\d+$/.test(b.text.trim()))
    .map((b) => [b.xCenter, b.text.trim()]);
  if (!candidates.length) return null;

  if (qtyX != null) {
    let best = candidates[0];
    let bestDist = Math.abs(best[0] - qtyX);
    for (const candidate of candidates.slice(1)) {
      const dist = Math.abs(candidate[0] - qtyX);
      if (dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }
    return Number.parseInt(best[1], 10);
  }

  for (const [xCenter, txt] of candidates) {
    if (maxX * 0.45 < xCenter && xCenter < maxX * 0.72) {
      return Number.parseInt(txt, 10);
    }
  }
  return null;
}

function extractNamePartsFromRow(row, boundaryX, maxX) {
  const parts = [];
  const sorted = [...row].sort((a, b) => a.xLeft - b.xLeft);
  for (const block of sorted) {
    const t = block.text.trim();
    if (!isNameColumn(block, boundaryX)) continue;
    if (isProductCode(block, maxX)) continue;
    if (parsePrice(t) != null) continue;
    if (parseWeight(t) != null) continue;
    if (/^\d+$/.test(t) && block.xCenter > maxX * 0.35) continue;
    if (!looksLikeNameText(t)) continue;
    parts.push(t);
  }
  return parts;
}

function cleanProductName(rawName) {
  let name = rawName.trim().replace(/^[\s.,:-]+|[\s.,:-]+$/g, "");

  const weightMatch = WEIGHT_PATTERN.exec(name.toLowerCase());
  if (weightMatch) {
    const start = weightMatch.index;
    const end = start + weightMatch[0].length;
    name = (name.slice(0, start) + name.slice(end)).trim().replace(/^[\s.,:-]+|[\s.,:-]+$/g, "");
  }

  name = name.replace(/\b(шт|шt|штук)\b/gi, "").trim().replace(/^[\s.,:-]+|[\s.,:-]+$/g, "");

  const parts = name.split(/\s+/).filter(Boolean);
  while (parts.length && PRODUCT_CODE_RE.test(parts[0])) parts.shift();
  while (
    parts.length &&
    (PRODUCT_CODE_RE.test(parts[parts.length - 1]) ||
      (parts[parts.length - 1].length <= 2 && /^\d+$/.test(parts[parts.length - 1])))
  ) {
    parts.pop();
  }

  const cleaned = parts.join(" ").trim().replace(/^[\s.,:-]+|[\s.,:-]+$/g, "");
  if (!cleaned || (cleaned.length <= 2 && !/\p{L}/u.test(cleaned))) return "";
  if (PRODUCT_CODE_RE.test(cleaned)) return "";
  return cleaned;
}

function extractProductsFromRows(rows, boundaryX, maxX, priceX, qtyX) {
  const products = [];
  let pendingNameParts = [];
  let pendingWeight = null;
  let pendingQty = null;

  for (const rawRow of rows) {
    const row = [...rawRow].sort((a, b) => a.xLeft - b.xLeft);
    const fullRowStr = row.map((b) => b.text).join(" ");

    if (isSkipRow(fullRowStr)) continue;

    const rowPrices = extractRowPrices(row);
    const rowWeight = parseWeight(fullRowStr);
    const rowQty = selectQtyForRow(row, qtyX, maxX);

    if (rowPrices.length) {
      const purchasePrice = selectPriceForRow(rowPrices, priceX);

      const nameParts = [...pendingNameParts, ...extractNamePartsFromRow(row, boundaryX, maxX)];
      const rawName = cleanProductName(nameParts.join(" "));

      const finalWeight = rowWeight != null ? rowWeight : pendingWeight;
      const finalQty = rowQty != null ? rowQty : pendingQty;

      if (rawName && purchasePrice != null) {
        products.push({
          name: rawName,
          purchasePrice,
          weightOrVolume: finalWeight,
          quantity: finalQty,
        });
      }

      pendingNameParts = [];
      pendingWeight = null;
      pendingQty = null;
    } else {
      const continuationParts = extractNamePartsFromRow(row, boundaryX, maxX);
      if (continuationParts.length) pendingNameParts.push(...continuationParts);
      if (rowWeight != null) pendingWeight = rowWeight;
      if (rowQty != null) pendingQty = rowQty;
    }
  }

  return products;
}

/**
 * Основная функция: список текстовых блоков с координатами -> список
 * товаров [{name, purchasePrice, weightOrVolume, quantity}, ...].
 *
 * Блоки, попадающие ниже MIN_CONFIDENCE, должны быть отфильтрованы ещё
 * ДО вызова этой функции (движок-специфичный шаг, см. lib/visionOcr.js).
 *
 * @param {object[]} blocks
 * @param {object} [debug] если передать пустой объект, будет заполнен диагностикой
 */
export function parseProductsFromBlocks(blocks, debug = null) {
  if (debug) debug.blocksIn = blocks.length;
  if (!blocks.length) return [];

  const columns = detectHeaderColumns(blocks);
  if (debug) debug.headerColumns = { ...columns };

  const pageBottom = Math.max(...blocks.map((b) => b.yBottom));
  const headerZone = pageBottom * 0.4;
  let headerBottomY = 0;
  for (const block of blocks) {
    if (block.yTop > headerZone) continue;
    const textLower = block.text.toLowerCase();
    const isHeaderWord = Object.values(HEADER_KEYWORDS).some((kws) =>
      kws.some((kw) => textLower.includes(kw))
    );
    if (isHeaderWord) headerBottomY = Math.max(headerBottomY, block.yBottom);
  }

  let dataBlocks = blocks.filter((b) => b.yTop > headerBottomY - 8);
  if (!dataBlocks.length) dataBlocks = blocks;

  const maxX = Math.max(...dataBlocks.map((b) => b.xRight));
  const boundaryX = nameBoundaryX(columns, maxX);
  const priceX = columns.price;
  const qtyX = columns.qty;
  const rows = groupIntoRows(dataBlocks);
  if (debug) {
    debug.rowsFound = rows.length;
    debug.nameBoundaryX = boundaryX;
    debug.maxX = maxX;
  }

  const products = extractProductsFromRows(rows, boundaryX, maxX, priceX, qtyX);
  if (debug) debug.productsFound = products.length;

  if (products.length) return products;

  // Ничего не нашли — пробуем менее строгую стратегию: вся страница целиком
  // (без урезания по шапке).
  const fullMaxX = Math.max(...blocks.map((b) => b.xRight));
  const fullBoundaryX = nameBoundaryX(columns, fullMaxX);
  const fullRows = groupIntoRows(blocks);
  const fallbackProducts = extractProductsFromRows(fullRows, fullBoundaryX, fullMaxX, priceX, qtyX);

  if (fallbackProducts.length && debug) {
    debug.fallbackUsed = true;
    debug.fallbackProductsFound = fallbackProducts.length;
  }

  return fallbackProducts;
}

// Экспортируется для использования в дебаге/логировании (аналог
// save_ocr_blocks_json из Python-версии), не используется в основном потоке.
export function isColumnIndexRowForDebug(row) {
  return isColumnIndexRow(row);
}
