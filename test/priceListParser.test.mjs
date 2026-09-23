import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readWorkbook, detectColumnMapping, extractProducts } from "../src/lib/priceListParser.js";

const KRAFT_PATH =
  "/mnt/user-data/uploads/Крафт_Общий_прайс_22_07_551f7748_cd82_40b7_bef5_b88801d74092.xlsx";
const RESTORSERVICE_PATH =
  "/mnt/user-data/uploads/Прайс_15_09_26__13fbf76c-e626-4612-8ffd-0b9a1a6c60c8.xls";

function loadRows(path) {
  const buffer = readFileSync(path);
  const { sheets, defaultSheetName } = readWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  return sheets.find((s) => s.name === defaultSheetName).rows;
}

test("Kraft-like header: name column is not confused with external product code", () => {
  const rows = [
    ["", "", "Прайс-лист, Мостра-групп, филиал Крафт"],
    ["", "", "", "", "", "", "", "", "БАЗОВАЯ ЦЕНА", "", "ПРОМО ЦЕНА"],
    [
      "Внешний код товара",
      "Штрих-код товара",
      "Наименование товара",
      "Код ТНВЭД",
      "Код таможни",
      "Страна изготовления",
      "Вес шт., грамм",
      "Кол-во шт. в блоке.",
      "% НДС",
      "БЕЗ НДС",
      "С НДС за шт.",
    ],
    ["", "", 'Категория "Шоколад"'],
    [274732911, 7622201695927, "Шоколад молочный «Альпен Гольд» 80г_22шт", "", "", "Россия", 80, 22, 0.2, 4.28, 5.14],
  ];
  const { headerRowIndex, columns } = detectColumnMapping(rows);

  assert.equal(headerRowIndex, 2);
  assert.equal(columns.name, 2);
  assert.equal(columns.barcode, 1);
  assert.equal(columns.priceNoVat, 9);
  assert.equal(columns.priceWithVat, 10);

  const products = extractProducts(rows, headerRowIndex, { ...columns, priceColumn: columns.priceNoVat });
  assert.equal(products.length, 1);
  assert.equal(products[0].name, "Шоколад молочный «Альпен Гольд» 80г_22шт");
  assert.equal(products[0].barcode, "7622201695927");
  assert.equal(products[0].price, 4.28);
});

test("Kraft price list: detects header row and all key columns", () => {
  const rows = loadRows(KRAFT_PATH);
  const { headerRowIndex, columns, confidence } = detectColumnMapping(rows);

  assert.equal(headerRowIndex, 2);
  assert.ok(confidence >= 5, `expected decent confidence, got ${confidence}`);
  assert.equal(typeof columns.name, "number");
  assert.equal(typeof columns.barcode, "number");
  assert.equal(typeof columns.priceNoVat, "number");
  assert.equal(typeof columns.priceWithVat, "number");
  assert.equal(typeof columns.country, "number");
});

test("Kraft price list: extracts real products, skips category rows", () => {
  const rows = loadRows(KRAFT_PATH);
  const { headerRowIndex, columns } = detectColumnMapping(rows);
  const products = extractProducts(rows, headerRowIndex, {
    ...columns,
    priceColumn: columns.priceNoVat,
  });

  assert.ok(products.length > 50, `expected many products, got ${products.length}`);

  const alpenGold = products.find((p) => p.name.includes("Альпен Гольд» 80г_22шт") && !p.name.includes("TPR") && !p.name.includes("RU"));
  assert.ok(alpenGold, "should find base Alpen Gold 80g/22 product");
  assert.equal(alpenGold.price, 4.28);
  assert.equal(alpenGold.barcode, "7622201695927");
  assert.equal(alpenGold.country, "Россия");

  // Строки-категории ("Категория "Шоколад"", "Alpen Gold") не должны попасть в товары
  const categoryRow = products.find((p) => p.name.startsWith("Категория"));
  assert.equal(categoryRow, undefined);
});

test("RestorService (.xls) price list: detects header row and columns", () => {
  const rows = loadRows(RESTORSERVICE_PATH);
  const { headerRowIndex, columns, confidence } = detectColumnMapping(rows);

  assert.equal(headerRowIndex, 7);
  assert.ok(confidence >= 3, `expected decent confidence, got ${confidence}`);
  assert.equal(typeof columns.name, "number");
  assert.equal(typeof columns.barcode, "number");
  assert.equal(typeof columns.priceNoVat, "number");
});

test("RestorService (.xls) price list: extracts real products, skips company header rows", () => {
  const rows = loadRows(RESTORSERVICE_PATH);
  const { headerRowIndex, columns } = detectColumnMapping(rows);
  const products = extractProducts(rows, headerRowIndex, {
    ...columns,
    priceColumn: columns.priceNoVat,
  });

  assert.ok(products.length > 5, `expected several products, got ${products.length}`);

  const coffee = products.find((p) => p.barcode === "4602076001064");
  assert.ok(coffee, "should find the LEBO Extra coffee product by barcode");
  assert.equal(coffee.price, 42.54);

  // Строки реквизитов компании ("Общество с ограниченной...", "ПРОДУКТ-СЕРВИС")
  // не должны попасть в товары — у них нет цены в найденной колонке.
  const junkRow = products.find((p) => p.name.includes("ограниченной ответственностью"));
  assert.equal(junkRow, undefined);
});
