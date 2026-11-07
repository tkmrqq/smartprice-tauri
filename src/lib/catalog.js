/**
 * lib/catalog.js
 * Справочник товаров по штрихкоду — чистая логика (без БД и интерфейса).
 *
 * Идея: после каждого расчёта постоянные свойства товара (наценка, страна,
 * вес, сорт…) запоминаются по штрихкоду. При следующем импорте накладной
 * или прайса они подставляются сами, а по сохранённой цене закупки видно,
 * вырос ли товар в закупке.
 */
import { cleanBarcode } from "./barcode.js";

const MIN_KEY_LENGTH = 6;

/** Ключ товара в справочнике: только цифры штрихкода; "" — если кода нет или он слишком короткий. */
export function catalogKey(barcode) {
  const digits = cleanBarcode(barcode);
  return digits.length >= MIN_KEY_LENGTH ? digits : "";
}

function parseMoney(value) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number.parseFloat(String(value).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Равны ли две суммы с точностью до копейки (форматы "4,10" и "4.1" считаются одинаковыми). */
export function sameMoney(a, b) {
  const x = parseMoney(a);
  const y = parseMoney(b);
  if (x == null || y == null) return false;
  return Math.round(x * 100) === Math.round(y * 100);
}

/**
 * Изменение закупки относительно прошлой.
 * @returns {{direction: "up"|"down", pct: number, prev: number} | null} null — если
 *   сравнивать не с чем или цена не изменилась.
 */
export function purchaseDelta(previous, current) {
  const prev = parseMoney(previous);
  const cur = parseMoney(current);
  if (prev == null || cur == null || prev <= 0) return null;
  if (Math.round(prev * 100) === Math.round(cur * 100)) return null;
  return {
    direction: cur > prev ? "up" : "down",
    pct: (Math.abs(cur - prev) / prev) * 100,
    prev,
  };
}

export function formatPercent(pct) {
  return pct.toFixed(1).replace(".", ",");
}

const hasText = (value) => value != null && String(value).trim() !== "";

/**
 * Накладывает данные справочника на импортируемый товар.
 * Название, цена закупки, НДС и страна остаются из накладной (она главный
 * источник). Из справочника подставляется то, что задаёт сам пользователь
 * или что накладная лишь угадывает: наценки, сорт, вес и единица.
 * @returns {{product: object, filled: boolean}}
 */
export function mergeWithCatalog(product, hit) {
  if (!hit) return { product, filled: false };

  const merged = { ...product };
  if (hasText(hit.weight)) merged.weightOrVolume = hit.weight;
  if (hasText(hit.unit)) merged.unit = hit.unit;
  if (hasText(hit.markup)) merged.markup = hit.markup;
  if (hasText(hit.supplier_markup)) merged.supplierMarkup = hit.supplier_markup;
  if (hasText(hit.sort_grade)) merged.sortGrade = hit.sort_grade;
  if (hasText(hit.last_purchase_price)) merged.prevPurchasePrice = hit.last_purchase_price;
  return { product: merged, filled: true };
}

/**
 * Запись справочника по итогам расчёта строки; null, если у строки нет
 * пригодного штрихкода (такой товар в справочник не попадает).
 */
export function buildCatalogRecord(row, result) {
  const barcode = catalogKey(row.barcode);
  if (!barcode) return null;
  return {
    barcode,
    name: row.name,
    country: row.country ?? "",
    unit: row.unit ?? "",
    weight: row.weight ?? "",
    vat: row.vat ?? "",
    sortGrade: row.sortGrade ?? "",
    markup: String(result.requestedMarkup),
    supplierMarkup: String(row.supplierMarkup ?? ""),
    purchasePrice: result.purchasePrice,
    retailPrice: result.retailPrice,
  };
}

/**
 * Нужно ли печатать ценник заново: цена отличается от той, что печаталась в
 * прошлый раз, либо печатать ещё не доводилось (или штрихкода нет — тогда
 * сравнивать не с чем, ценник на всякий случай печатается).
 */
export function needsReprint(row, hit) {
  if (!catalogKey(row.barcode)) return true;
  if (!hit || !hasText(hit.last_printed_retail)) return true;
  return !sameMoney(row.retailPrice, hit.last_printed_retail);
}
