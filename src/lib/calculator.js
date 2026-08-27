/**
 * lib/calculator.js
 * Расчёт розничных цен с учётом постановления СМ РБ № 713
 * (в редакции постановления № 359 от 10.07.2026, упрощённая модель).
 *
 * Цепочка расчёта:
 *   закупочная × (1 + наценка поставщика) × (1 + торговая наценка) × (1 + НДС)
 *
 * Перечень регулируемых категорий живёт в src/assets/regulated_items.json —
 * его можно редактировать без правки кода (см. настройки приложения).
 */

/** @typedef {{id:string, category_name:string, keywords:string[], exclude_keywords?:string[], max_markup:number|null, max_markup_imported?:number|null, note?:string, imported_note?:string}} RegulatedCategory */

let _categories = /** @type {RegulatedCategory[]} */ ([]);

/**
 * Загружает (или перегружает) список регулируемых категорий.
 * Вызывается один раз при старте приложения после чтения JSON
 * (пользовательского, из app data dir, либо встроенного по умолчанию).
 * @param {{categories?: RegulatedCategory[]}} data
 */
export function setRegulatedCategories(data) {
  _categories = Array.isArray(data?.categories) ? data.categories : [];
}

export function getRegulatedCategories() {
  return _categories;
}

function formatPrice(value) {
  return value.toFixed(2).replace(".", ",");
}

/**
 * Разбирает число, введённое пользователем (допускает запятую, пробелы).
 * @param {string|number} value
 */
function parseFloatLoose(value) {
  const normalized = String(value).replace(",", ".").trim();
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`Не удалось распознать число: "${value}"`);
  }
  return parsed;
}

function isImported(country) {
  const norm = (country || "").trim().toLowerCase();
  if (!norm) return false;
  return !["беларусь", "рб", "республика беларусь"].includes(norm);
}

/**
 * @returns {{category: string|null, maxMarkup: number|null, markupUnknown: boolean, note: string|null}}
 */
function detectRegulation(name, country = "") {
  const nameLower = ` ${(name || "").toLowerCase()} `;
  const imported = isImported(country);

  for (const cat of _categories) {
    const keywords = cat.keywords || [];
    if (!keywords.some((kw) => nameLower.includes(kw))) continue;

    const excludeKeywords = cat.exclude_keywords || [];
    if (excludeKeywords.some((kw) => nameLower.includes(kw))) continue;

    const categoryName = cat.category_name || cat.id || "Регулируемая категория";

    let maxMarkup = cat.max_markup ?? null;
    if (imported && cat.max_markup_imported != null) {
      maxMarkup = cat.max_markup_imported;
    }

    const markupUnknown = maxMarkup == null;
    const note = imported ? cat.imported_note ?? cat.note ?? null : cat.note ?? null;
    return { category: categoryName, maxMarkup, markupUnknown, note };
  }

  return { category: null, maxMarkup: null, markupUnknown: false, note: null };
}

/**
 * @param {object} params
 * @param {string} params.name
 * @param {string|number} params.purchasePrice
 * @param {string|number} params.userMarkup
 * @param {string|number} [params.weightOrVolume]
 * @param {string|number} [params.supplierMarkup]
 * @param {string|number} [params.vat]
 * @param {string} [params.unit]
 * @param {string} [params.country]
 */
export function calculateBelarusPrice({
  name,
  purchasePrice,
  userMarkup,
  weightOrVolume = 1.0,
  supplierMarkup = 0.0,
  vat = 20.0,
  unit = "шт",
  country = "",
}) {
  const purchase = parseFloatLoose(purchasePrice);
  const requestedMarkup = parseFloatLoose(userMarkup);
  const supplier = parseFloatLoose(supplierMarkup);
  const vatRate = parseFloatLoose(vat);
  const weight = parseFloatLoose(weightOrVolume ?? 1.0);
  const unitNorm = (unit || "шт").trim().toLowerCase();

  if (purchase < 0) throw new Error("Закупочная цена не может быть отрицательной");
  if (weight <= 0) throw new Error("Вес/объём должен быть больше нуля");
  if (requestedMarkup < 0) throw new Error("Торговая наценка не может быть отрицательной");
  if (supplier < 0) throw new Error("Наценка поставщика не может быть отрицательной");
  if (vatRate < 0) throw new Error("НДС не может быть отрицательным");

  const { category, maxMarkup, markupUnknown, note } = detectRegulation(name, country);
  let appliedMarkup = requestedMarkup;
  let markupLimited = false;

  if (maxMarkup != null && requestedMarkup > maxMarkup) {
    appliedMarkup = maxMarkup;
    markupLimited = true;
  }

  const afterSupplier = purchase * (1.0 + supplier / 100.0);
  const afterTrade = afterSupplier * (1.0 + appliedMarkup / 100.0);
  const retail = Math.round(afterTrade * (1.0 + vatRate / 100.0) * 100) / 100;

  let pricePerUnit;
  let unitLabel;
  if (unitNorm === "кг" || unitNorm === "л") {
    pricePerUnit = Math.round((retail / weight) * 100) / 100;
    unitLabel = `1 ${unitNorm}`;
  } else {
    pricePerUnit = retail;
    unitLabel = "шт";
  }

  let regulationStatus;
  if (category == null) {
    regulationStatus = "Не регулируется";
  } else if (markupUnknown) {
    regulationStatus = "Регулируется (уточните % наценки в списке категорий)";
  } else {
    regulationStatus = "Регулируется";
  }

  return {
    name,
    category,
    purchasePrice: formatPrice(purchase),
    supplierMarkup: supplier,
    vat: vatRate,
    unit: unitNorm,
    unitLabel,
    requestedMarkup,
    appliedMarkup,
    markupLimited,
    markupPercentUnknown: markupUnknown,
    regulationNote: note,
    retailPrice: formatPrice(retail),
    pricePerUnit: formatPrice(pricePerUnit),
    regulationStatus,
  };
}
