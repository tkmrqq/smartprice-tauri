/**
 * lib/edinParser.js
 * Парсинг накладных ЭДИН (формат BLRWBL / DeliveryNote XML).
 * Использует стандартный браузерный DOMParser (доступен в webview Tauri).
 */

// Примечание: обычный \b в JS считает "словесными" только символы [A-Za-z0-9_]
// (в отличие от Python re, где \b по умолчанию юникодный и включает кириллицу).
// Поэтому вместо \b после кириллической единицы измерения используем явный
// negative lookahead — иначе "900мл" или "1кг" вообще не находились бы.
const WEIGHT_IN_NAME_RE = /(\d+[.,]?\d*)\s*(мл|ml|г|g|л|l|кг|kg)(?![a-zA-Zа-яёА-ЯЁ0-9])/i;

const COUNTRY_MAP = {
  BY: "Беларусь",
  RU: "Россия",
  PL: "Польша",
  UA: "Украина",
};

function text(element, tag, fallback = "") {
  if (!element) return fallback;
  const child = element.getElementsByTagName(tag)[0];
  const value = child?.textContent?.trim();
  return value || fallback;
}

function parseFloatOrNull(value) {
  if (!value) return null;
  const normalized = String(value).replace(",", ".").replace(/\s/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function extractWeightFromName(name) {
  // Ищем ПОСЛЕДНЕЕ совпадение в строке (как .finditer(...)[-1] в Python)
  const re = new RegExp(WEIGHT_IN_NAME_RE.source, "gi");
  let match;
  let last = null;
  while ((match = re.exec(name)) !== null) {
    last = match;
  }
  if (!last) return null;

  const value = Number.parseFloat(last[1].replace(",", "."));
  if (Number.isNaN(value)) return null;

  const unit = last[2].toLowerCase();
  if (unit === "г" || unit === "g") return Math.round((value / 1000) * 1e6) / 1e6;
  if (unit === "мл" || unit === "ml") return Math.round((value / 1000) * 1e6) / 1e6;
  return value;
}

function guessUnit(weightOrVolume, name) {
  if (weightOrVolume == null) return "шт";
  const lower = name.toLowerCase();
  if (["кг", "г", " kg", " g"].some((u) => lower.includes(u))) return "кг";
  if (["л", "мл", " l", " ml"].some((u) => lower.includes(u))) return "л";
  return Math.abs(weightOrVolume - 1.0) > 0.001 ? "кг" : "шт";
}

function mapCountry(code) {
  return COUNTRY_MAP[(code || "").toUpperCase()] || code || "Беларусь";
}

/**
 * @param {string} xmlText содержимое XML-файла
 * @returns {{meta: object, products: object[]}}
 */
export function parseEdinXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error("Не удалось разобрать XML-файл: " + parserError.textContent);
  }

  const root = doc.documentElement;
  const delivery = root.getElementsByTagName("DeliveryNote")[0];
  if (!delivery) {
    throw new Error(
      "Файл не содержит элемента DeliveryNote — возможно, это не накладная ЭДИН."
    );
  }

  const shipper = delivery.getElementsByTagName("Shipper")[0];
  const meta = {
    documentId: text(delivery, "DeliveryNoteID"),
    documentDate: text(delivery, "DeliveryNoteDate"),
    waybillId: text(delivery, "WaybillID"),
    shipperName: shipper ? text(shipper, "Name") : "",
    currency: text(delivery, "Currency", "BYN"),
  };

  /** @type {object[]} */
  const products = [];
  const container = delivery.getElementsByTagName("DespatchAdviceLogisticUnitLineItem")[0];
  if (!container) {
    return { meta, products };
  }

  const items = Array.from(container.getElementsByTagName("LineItem"));
  for (const item of items) {
    const sign = text(item, "LineItemSign");
    if (sign && sign !== "PROD") continue;

    const name = text(item, "LineItemName");
    if (!name) continue;

    let price = parseFloatOrNull(text(item, "LineItemPrice"));
    if (price == null) {
      const fcc = item.getElementsByTagName("FieldCostControl")[0];
      if (fcc) {
        price = parseFloatOrNull(text(fcc, "LineItemManufacturerOutputPrice"));
      }
    }
    if (price == null) continue;

    const vatRaw = text(item, "TaxRate", "20");
    const vat = vatRaw ? String(Math.trunc(Number.parseFloat(vatRaw.replace(",", ".")))) : "20";

    const quantityRaw = text(item, "QuantityDespatched");
    const quantity = quantityRaw ? Math.trunc(Number.parseFloat(quantityRaw.replace(",", "."))) : null;

    const weight = extractWeightFromName(name);
    const country = mapCountry(text(item, "CountryOfOrigin", "BY"));

    products.push({
      name,
      purchasePrice: price,
      weightOrVolume: weight,
      unit: guessUnit(weight, name),
      vat,
      country,
      barcode: text(item, "LineItemID"),
      quantity,
    });
  }

  return { meta, products };
}
