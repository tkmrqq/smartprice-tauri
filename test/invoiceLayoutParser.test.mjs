import test from "node:test";
import assert from "node:assert/strict";
import { parseProductsFromBlocks } from "../src/lib/invoiceLayoutParser.js";

// Утилита: создаёт блок с координатами по x/y-диапазонам.
function block(text, xLeft, xRight, yTop, yBottom, confidence = 0.9) {
  return {
    text,
    xLeft,
    xRight,
    xCenter: (xLeft + xRight) / 2,
    yTop,
    yBottom,
    yCenter: (yTop + yBottom) / 2,
    height: yBottom - yTop,
    confidence,
  };
}

function buildSampleBlocks() {
  return [
    // --- шапка таблицы (y 10-30) ---
    block("Наименование", 20, 180, 10, 30),
    block("Цена", 400, 460, 10, 30),
    block("Кол-во", 550, 610, 10, 30),

    // --- строка 1: Молоко 900мл 2,5%, цена 2.15, кол-во 12 ---
    block("Молоко", 20, 100, 50, 72),
    block("2,5%", 105, 150, 50, 72),
    block("900мл", 155, 210, 50, 72),
    block("2.15", 410, 460, 50, 72),
    block("12", 555, 590, 50, 72),

    // --- строка 2: Хлеб Бородинский, цена 1.98, кол-во 5 ---
    block("Хлеб", 20, 90, 90, 112),
    block("Бородинский", 95, 220, 90, 112),
    block("1,98", 410, 460, 90, 112),
    block("5", 555, 590, 90, 112),

    // --- строка 3 (продолжение имени, без цены): "Сыр" ---
    block("Сыр", 20, 70, 130, 150),

    // --- строка 4: "Российский" 1кг, цена 18.90, кол-во 3 ---
    block("Российский", 20, 140, 155, 177),
    block("1кг", 145, 180, 155, 177),
    block("18,90", 410, 460, 155, 177),
    block("3", 555, 590, 155, 177),

    // --- строка "Итого" — должна быть пропущена целиком ---
    block("Итого", 20, 90, 200, 220),
    block("23.03", 410, 460, 200, 220),
  ];
}

test("parses two direct product rows with name, price, weight, qty", () => {
  const products = parseProductsFromBlocks(buildSampleBlocks());

  const milk = products.find((p) => p.name.includes("Молоко"));
  assert.ok(milk, "milk product should be found");
  assert.equal(milk.purchasePrice, 2.15);
  assert.equal(milk.weightOrVolume, 0.9);
  assert.equal(milk.quantity, 12);
  // "2,5%" остаётся частью имени (не похоже ни на цену, ни на вес)
  assert.match(milk.name, /Молоко/);

  const bread = products.find((p) => p.name.includes("Хлеб"));
  assert.ok(bread, "bread product should be found");
  assert.equal(bread.purchasePrice, 1.98);
  assert.equal(bread.quantity, 5);
});

test("joins a continuation row (name without price) with the following priced row", () => {
  const products = parseProductsFromBlocks(buildSampleBlocks());
  const cheese = products.find((p) => p.name.includes("Российский"));
  assert.ok(cheese, "cheese product should be found");
  assert.equal(cheese.name, "Сыр Российский");
  assert.equal(cheese.purchasePrice, 18.9);
  assert.equal(cheese.weightOrVolume, 1);
  assert.equal(cheese.quantity, 3);
});

test("skips 'Итого' row entirely, does not create a phantom product", () => {
  const products = parseProductsFromBlocks(buildSampleBlocks());
  const total = products.find((p) => p.name.toLowerCase().includes("итого"));
  assert.equal(total, undefined);
  assert.equal(products.length, 3);
});

test("returns empty array for empty input", () => {
  assert.deepEqual(parseProductsFromBlocks([]), []);
});

test("low-confidence blocks are expected to be filtered by the caller, not here", () => {
  // parseProductsFromBlocks сам не фильтрует по confidence — это ответственность
  // движко-специфичного слоя (visionOcr.js), как и в оригинале.
  const blocks = buildSampleBlocks();
  blocks[3].confidence = 0.05; // "Молоко" — если бы фильтровали здесь, тест бы это поймал
  const products = parseProductsFromBlocks(blocks);
  const milk = products.find((p) => p.name.includes("Молоко"));
  assert.ok(milk, "low confidence block is still used by this layer");
});
