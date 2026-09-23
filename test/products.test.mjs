import test from "node:test";
import assert from "node:assert/strict";
import { guessUnit, formatWeight } from "../src/stores/products.js";

test("guessUnit respects explicit hint", () => {
  assert.equal(guessUnit(0.5, "л"), "л");
});

test("guessUnit defaults to шт for weight 1 or empty", () => {
  assert.equal(guessUnit(null), "шт");
  assert.equal(guessUnit(1.0), "шт");
});

test("guessUnit falls back to кг for non-unit weights", () => {
  assert.equal(guessUnit(0.9), "кг");
});

test("formatWeight uses comma as decimal separator", () => {
  assert.equal(formatWeight(0.9), "0,9");
  assert.equal(formatWeight(null), "1,0");
});
