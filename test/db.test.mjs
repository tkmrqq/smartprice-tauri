import test from "node:test";
import assert from "node:assert/strict";
import { dedupKey } from "../src/lib/db.js";

test("dedupKey is stable regardless of case/whitespace", () => {
  const a = dedupKey({
    name: " Молоко ",
    purchasePrice: "2,00",
    weightOrVolume: "1",
    supplierMarkup: "0",
    appliedMarkup: "5",
    vat: "20",
    unit: "Л",
    sortGrade: "",
    country: "россия",
  });
  const b = dedupKey({
    name: "молоко",
    purchasePrice: "2,00",
    weightOrVolume: "1",
    supplierMarkup: "0",
    appliedMarkup: "5",
    vat: "20",
    unit: "л",
    sortGrade: "",
    country: "Россия",
  });
  assert.equal(a, b);
});

test("dedupKey changes when the purchase price changes", () => {
  const base = { name: "Хлеб", purchasePrice: "1,50", weightOrVolume: "1", appliedMarkup: "10", vat: "20" };
  const a = dedupKey(base);
  const b = dedupKey({ ...base, purchasePrice: "1,60" });
  assert.notEqual(a, b);
});

test("dedupKey ignores derived fields like retailPrice", () => {
  const a = dedupKey({ name: "X", purchasePrice: "1", appliedMarkup: "10", retailPrice: "1,32" });
  const b = dedupKey({ name: "X", purchasePrice: "1", appliedMarkup: "10", retailPrice: "999,99" });
  assert.equal(a, b);
});

test("falls back to requestedMarkup when appliedMarkup is absent", () => {
  const a = dedupKey({ name: "X", purchasePrice: "1", requestedMarkup: "15" });
  const b = dedupKey({ name: "X", purchasePrice: "1", appliedMarkup: "15" });
  assert.equal(a, b);
});
