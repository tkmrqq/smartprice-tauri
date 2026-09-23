import test from "node:test";
import assert from "node:assert/strict";
import { buildLabelsHtml } from "../src/lib/priceLabels.js";

test("builds a card per row and escapes HTML in names", () => {
  const html = buildLabelsHtml([
    {
      name: 'Хлеб "Бородинский" <опт>',
      retailPrice: "1,98",
      pricePerUnit: "3,96",
      unit: "кг",
      weight: "0,5",
      sortGrade: "",
      country: "Беларусь",
    },
    {
      name: "Молоко 900мл",
      retailPrice: "2,52",
      pricePerUnit: "2,52",
      unit: "шт",
      weight: "",
      sortGrade: "Высший",
      country: "Россия",
    },
  ]);

  assert.match(html, /Хлеб &quot;Бородинский&quot; &lt;опт&gt;/);
  assert.doesNotMatch(html, /<опт>/);
  assert.match(html, /Цена за 1 кг: 3,96 руб\./);
  assert.match(html, /Цена за штуку: 2,52 руб\./);
  assert.match(html, /Сорт \/ вид: Высший/);
  assert.match(html, /class="tags-grid"/);
  assert.equal((html.match(/class="price-tag"/g) || []).length, 2);
});

test("empty rows produce an empty grid without throwing", () => {
  const html = buildLabelsHtml([]);
  assert.match(html, /class="tags-grid"/);
});
