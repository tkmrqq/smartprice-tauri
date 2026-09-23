import test from "node:test";
import assert from "node:assert/strict";
import { matchAcrossSuppliers, normalizeBarcode, tokenize, jaccardSimilarity } from "../src/lib/priceMatcher.js";

test("normalizeBarcode strips non-digits and leading zeros", () => {
  assert.equal(normalizeBarcode("4602076001064"), "4602076001064");
  assert.equal(normalizeBarcode(" 0460207 6001064 "), "460207 6001064".replace(/\D/g, ""));
  assert.equal(normalizeBarcode("00012345"), "12345");
  assert.equal(normalizeBarcode(""), "");
  assert.equal(normalizeBarcode(null), "");
  assert.equal(normalizeBarcode("12"), ""); // слишком коротко для штрихкода
});

test("exact scenario from the user: same product, two suppliers, different price", () => {
  const result = matchAcrossSuppliers([
    { supplierName: "Поставщик X", products: [{ name: "Молоко Бабушкино 900мл 2.5%", price: 4.13, barcode: "4810123456789" }] },
    { supplierName: "Поставщик Y", products: [{ name: "Молоко Бабушкино 900мл 2.5%", price: 4.10, barcode: "4810123456789" }] },
  ]);

  assert.equal(result.length, 1);
  const group = result[0];
  assert.equal(group.matchType, "barcode");
  assert.equal(group.supplierCount, 2);
  assert.equal(group.cheapest.supplier, "Поставщик Y");
  assert.equal(group.cheapest.price, 4.10);
  assert.ok(Math.abs(group.savingsAbs - 0.03) < 1e-9);
});

test("matches by fuzzy name when barcodes are missing", () => {
  const result = matchAcrossSuppliers([
    { supplierName: "A", products: [{ name: 'Шоколад молочный "Альпен Гольд" 80г', price: 4.28, barcode: "" }] },
    { supplierName: "B", products: [{ name: "Шоколад молочный Альпен Гольд 80 г", price: 4.05, barcode: "" }] },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].matchType, "name");
  assert.equal(result[0].supplierCount, 2);
  assert.equal(result[0].cheapest.supplier, "B");
});

test("does not merge clearly different products", () => {
  const result = matchAcrossSuppliers([
    { supplierName: "A", products: [{ name: "Шоколад молочный Альпен Гольд 80г", price: 4.28, barcode: "" }] },
    { supplierName: "B", products: [{ name: "Кофе жареный в зернах Арабика 1000г", price: 42.54, barcode: "" }] },
  ]);

  assert.equal(result.length, 2);
  for (const group of result) assert.equal(group.supplierCount, 1);
});

test("barcode match wins even if names are phrased very differently", () => {
  const result = matchAcrossSuppliers([
    { supplierName: "A", products: [{ name: "Товар №1 (арт. 12345)", price: 10, barcode: "7622201695927" }] },
    { supplierName: "B", products: [{ name: "Шоколад Альпен Гольд молочный", price: 9.5, barcode: "7622201695927" }] },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].matchType, "barcode");
  assert.equal(result[0].supplierCount, 2);
});

test("single-supplier items still appear as their own group (supplierCount 1)", () => {
  const result = matchAcrossSuppliers([
    { supplierName: "A", products: [{ name: "Уникальный товар только у А", price: 1, barcode: "" }] },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].supplierCount, 1);
});

test("three suppliers, picks the true minimum, not just first vs second", () => {
  const result = matchAcrossSuppliers([
    { supplierName: "A", products: [{ name: "Сахар песок 1кг", price: 1.50, barcode: "1111111111" }] },
    { supplierName: "B", products: [{ name: "Сахар песок 1кг", price: 1.35, barcode: "1111111111" }] },
    { supplierName: "C", products: [{ name: "Сахар песок 1кг", price: 1.42, barcode: "1111111111" }] },
  ]);
  assert.equal(result[0].cheapest.supplier, "B");
  assert.equal(result[0].cheapest.price, 1.35);
  assert.equal(result[0].supplierCount, 3);
});

test("groups sorted by absolute savings descending", () => {
  const result = matchAcrossSuppliers([
    {
      supplierName: "A",
      products: [
        { name: "Товар дешёвый спред", price: 1.0, barcode: "2222222222" },
        { name: "Товар дорогой спред", price: 100, barcode: "3333333333" },
      ],
    },
    {
      supplierName: "B",
      products: [
        { name: "Товар дешёвый спред", price: 1.10, barcode: "2222222222" },
        { name: "Товар дорогой спред", price: 80, barcode: "3333333333" },
      ],
    },
  ]);
  assert.equal(result[0].key, "barcode:3333333333"); // разница 20 > разницы 0.1
});

test("tokenize drops unit/pack stopwords", () => {
  const tokens = tokenize("Шоколад 80г_22шт TPR");
  assert.ok(!tokens.includes("шт"));
  assert.ok(!tokens.includes("tpr"));
  assert.ok(tokens.includes("шоколад"));
});

test("jaccardSimilarity is 1 for identical token sets, 0 for disjoint", () => {
  assert.equal(jaccardSimilarity(["a", "b"], ["a", "b"]), 1);
  assert.equal(jaccardSimilarity(["a", "b"], ["c", "d"]), 0);
});

test("matches identical names across suppliers even when barcodes differ", () => {
  const dirol =
    "Жеват.резинка б/сах. ароматизир. DIROL FRUIT MIX XXL Ассорти фруктовых вкусов 19г_18штх24бл";
  const result = matchAcrossSuppliers([
    { supplierName: "Прайс 15.09", products: [{ name: dirol, price: 0.62, barcode: "6923444873860" }] },
    { supplierName: "Крафт", products: [{ name: dirol, price: 1.66, barcode: "7622201685881" }] },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].supplierCount, 2);
  assert.equal(result[0].matchType, "name");
  assert.equal(result[0].cheapest.supplier, "Прайс 15.09");
  assert.equal(result[0].cheapest.price, 0.62);
  assert.ok(Math.abs(result[0].savingsAbs - 1.04) < 1e-9);
});

test("does not merge similar products with different barcodes unless names are nearly identical", () => {
  const result = matchAcrossSuppliers([
    { supplierName: "A", products: [{ name: "Шоколад молочный Альпен Гольд 80г", price: 4.28, barcode: "1111111111" }] },
    { supplierName: "B", products: [{ name: "Шоколад молочный Альпен Гольд 90г", price: 4.05, barcode: "2222222222" }] },
  ]);

  assert.equal(result.length, 2);
  for (const group of result) assert.equal(group.supplierCount, 1);
});
