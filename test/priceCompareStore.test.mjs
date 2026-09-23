import test from "node:test";
import assert from "node:assert/strict";
import { guessSupplierName } from "../src/stores/priceCompare.js";

test("strips extension and trailing UUID/hash suffix", () => {
  assert.equal(
    guessSupplierName("Крафт_Общий_прайс_22_07_551f7748_cd82_40b7_bef5_b88801d74092.xlsx"),
    "Крафт Общий прайс 22 07"
  );
});

test("strips extension and trailing uuid for the second real file", () => {
  assert.equal(
    guessSupplierName("Прайс_15_09_26__13fbf76c-e626-4612-8ffd-0b9a1a6c60c8.xls"),
    "Прайс 15 09 26"
  );
});

test("plain filename without hash stays mostly intact", () => {
  assert.equal(guessSupplierName("Прайс-Лист_ООО_Ромашка.xlsx"), "Прайс-Лист ООО Ромашка");
});
