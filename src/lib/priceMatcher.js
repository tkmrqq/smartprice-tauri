/**
 * lib/priceMatcher.js
 * Сопоставляет товары из прайсов разных поставщиков в группы "один и тот
 * же товар", чтобы найти самое выгодное предложение. Приоритет:
 *   1) совпадение по штрихкоду (самый надёжный признак),
 *   2) нечёткое совпадение по названию (токены + похожесть по Жаккару) —
 *      для товаров без штрихкода или когда штрихкоды не совпали.
 */

const STOPWORDS = new Set([
  "шт", "уп", "упак", "кор", "кг", "гр", "г", "мл", "л", "бл", "блок", "пач", "ед", "рф", "ru", "тпр", "tpr", "spr",
]);

export function normalizeBarcode(raw) {
  if (raw == null) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 6) return ""; // слишком коротко, чтобы быть настоящим штрихкодом
  return digits.replace(/^0+/, "") || "0";
}

export function normalizeName(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[«»"'()]/g, " ")
    .replace(/[_\-–—.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(raw) {
  const normalized = normalizeName(raw);
  return normalized
    .split(" ")
    .map((t) => t.replace(/[^a-zа-яё0-9]/gi, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function jaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const DEFAULT_NAME_SIMILARITY_THRESHOLD = 0.6;
// Если у двух позиций разные штрихкоды, объединяем только при почти
// идентичном названии — иначе это, скорее всего, разные SKU.
const CONFLICTING_BARCODE_NAME_THRESHOLD = 0.95;

function hasConflictingBarcode(item, group) {
  return group.items.some(
    (existing) => item.barcode && existing.barcode && item.barcode !== existing.barcode
  );
}

/**
 * @param {{supplierName: string, products: object[]}[]} supplierDatasets
 *   products: [{name, price, barcode, vatRate, packQty, country, ...}]
 * @param {{nameSimilarityThreshold?: number}} [options]
 * @returns {object[]} группы товаров с ценами по каждому поставщику
 */
export function matchAcrossSuppliers(supplierDatasets, options = {}) {
  const threshold = options.nameSimilarityThreshold ?? DEFAULT_NAME_SIMILARITY_THRESHOLD;

  /** @type {{key:string, matchType:string, items: object[], tokens: string[]}[]} */
  const barcodeGroups = [];
  const barcodeGroupIndex = new Map();

  const allItems = [];
  for (const dataset of supplierDatasets) {
    for (const product of dataset.products) {
      allItems.push({
        supplier: dataset.supplierName,
        name: product.name,
        price: product.price,
        barcode: normalizeBarcode(product.barcode),
        vatRate: product.vatRate,
        packQty: product.packQty,
        country: product.country,
        tokens: tokenize(product.name),
      });
    }
  }

  // Проход 1: группировка по штрихкоду — самый надёжный признак, но
  // только если один и тот же код встретился у нескольких поставщиков.
  const fuzzyCandidates = [];
  for (const item of allItems) {
    if (!item.barcode) {
      fuzzyCandidates.push(item);
      continue;
    }
    if (barcodeGroupIndex.has(item.barcode)) {
      barcodeGroups[barcodeGroupIndex.get(item.barcode)].items.push(item);
    } else {
      barcodeGroupIndex.set(item.barcode, barcodeGroups.length);
      barcodeGroups.push({ key: `barcode:${item.barcode}`, matchType: "barcode", items: [item], tokens: item.tokens });
    }
  }

  const confirmedBarcodeGroups = [];
  for (const group of barcodeGroups) {
    const supplierCount = new Set(group.items.map((i) => i.supplier)).size;
    if (supplierCount > 1) {
      confirmedBarcodeGroups.push(group);
    } else {
      fuzzyCandidates.push(...group.items);
    }
  }

  // Проход 2: нечёткое сравнение по токенам названия для всего, что не
  // подтвердилось штрихкодом у ≥2 поставщиков (в т.ч. при ошибочном/чужом
  // штрихкоде в одном из прайсов).
  const fuzzyGroups = [];
  for (const item of fuzzyCandidates) {
    let bestGroup = null;
    let bestScore = 0;
    for (const group of fuzzyGroups) {
      const score = jaccardSimilarity(item.tokens, group.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestGroup = group;
      }
    }
    const effectiveThreshold =
      bestGroup && hasConflictingBarcode(item, bestGroup)
        ? CONFLICTING_BARCODE_NAME_THRESHOLD
        : threshold;
    if (bestGroup && bestScore >= effectiveThreshold) {
      bestGroup.items.push(item);
      // tokens группы = токены первого товара (эталон); можно было бы
      // усреднять, но это усложнение того не стоит для UI-инструмента.
    } else {
      fuzzyGroups.push({ key: `name:${item.tokens.join("-")}`, matchType: "name", items: [item], tokens: item.tokens });
    }
  }

  const allGroups = [...confirmedBarcodeGroups, ...fuzzyGroups];

  return allGroups
    .map((group) => {
      const items = group.items;
      const sorted = [...items].sort((a, b) => a.price - b.price);
      const cheapest = sorted[0];
      const mostExpensive = sorted[sorted.length - 1];
      const supplierCount = new Set(items.map((i) => i.supplier)).size;

      return {
        key: group.key,
        matchType: group.matchType,
        displayName: cheapest.name,
        items: sorted,
        supplierCount,
        cheapest,
        savingsAbs: mostExpensive.price - cheapest.price,
        savingsPct: mostExpensive.price > 0 ? (mostExpensive.price - cheapest.price) / mostExpensive.price : 0,
      };
    })
    .sort((a, b) => b.savingsAbs - a.savingsAbs);
}
