import { defineStore } from "pinia";
import { calculateBelarusPrice } from "../lib/calculator.js";
import { saveCalculation } from "../lib/db.js";

const DEFAULTS = {
  weight: "1,0",
  markup: "30",
  supplierMarkup: "0",
  vat: "20",
  unit: "шт",
  country: "Беларусь",
};

let _nextId = 1;

export function guessUnit(weightOrVolume, unitHint) {
  if (unitHint) return unitHint;
  if (weightOrVolume == null || weightOrVolume === "") return DEFAULTS.unit;
  const value = Number.parseFloat(String(weightOrVolume).replace(",", "."));
  if (Number.isNaN(value)) return DEFAULTS.unit;
  return Math.abs(value - 1.0) > 0.001 ? "кг" : DEFAULTS.unit;
}

export function formatWeight(weightOrVolume) {
  if (weightOrVolume == null || weightOrVolume === "") return DEFAULTS.weight;
  return String(weightOrVolume).replace(".", ",");
}

function emptyRow(overrides = {}) {
  return {
    id: _nextId++,
    name: "",
    purchasePrice: "",
    weight: DEFAULTS.weight,
    unit: DEFAULTS.unit,
    supplierMarkup: DEFAULTS.supplierMarkup,
    markup: DEFAULTS.markup,
    vat: DEFAULTS.vat,
    sortGrade: "",
    country: DEFAULTS.country,
    // Рассчитываемые поля (только для чтения в UI):
    retailPrice: "",
    pricePerUnit: "",
    regulationStatus: "",
    regulationCategory: null,
    markupLimited: false,
    markupPercentUnknown: false,
    calcError: "",
    ...overrides,
  };
}

export const useProductsStore = defineStore("products", {
  state: () => ({
    rows: [emptyRow()],
    statusMessage: "Готово к работе.",
    isBusy: false,
  }),

  getters: {
    rowCount: (state) => state.rows.length,
  },

  actions: {
    addRow(overrides = {}) {
      const weightOrVolume = overrides.weightOrVolume;
      const row = emptyRow({
        name: overrides.name ?? "",
        purchasePrice: overrides.purchasePrice != null ? String(overrides.purchasePrice) : "",
        weight: formatWeight(weightOrVolume),
        unit: guessUnit(weightOrVolume, overrides.unit),
        vat: overrides.vat != null ? String(overrides.vat) : DEFAULTS.vat,
        country: overrides.country || DEFAULTS.country,
      });
      this.rows.push(row);
      return row;
    },

    removeRow(id) {
      this.rows = this.rows.filter((r) => r.id !== id);
      if (this.rows.length === 0) this.addRow();
    },

    updateField(id, field, value) {
      const row = this.rows.find((r) => r.id === id);
      if (row) row[field] = value;
    },

    /** Импорт из накладной ЭДИН или результата OCR — оба дают одинаковую форму продукта. */
    importProducts(products) {
      for (const p of products) {
        this.addRow({
          name: p.name,
          purchasePrice: p.purchasePrice,
          weightOrVolume: p.weightOrVolume,
          unit: p.unit,
          vat: p.vat,
          country: p.country,
        });
      }
    },

    /** Пересчитывает все строки с непустым названием, сохраняет в историю. */
    async calculateAll() {
      const errors = [];
      const rowsToCalc = this.rows.filter((r) => r.name.trim());

      if (!rowsToCalc.length) {
        this.statusMessage = "Добавьте хотя бы один товар для расчёта.";
        return { ok: false, errors: ["Нет данных для расчёта"] };
      }

      this.isBusy = true;
      try {
        for (const row of rowsToCalc) {
          try {
            const result = calculateBelarusPrice({
              name: row.name,
              purchasePrice: row.purchasePrice,
              userMarkup: row.markup || DEFAULTS.markup,
              weightOrVolume: row.weight || DEFAULTS.weight,
              supplierMarkup: row.supplierMarkup || DEFAULTS.supplierMarkup,
              vat: row.vat || DEFAULTS.vat,
              unit: row.unit || DEFAULTS.unit,
              country: row.country || DEFAULTS.country,
            });

            row.retailPrice = result.retailPrice;
            row.pricePerUnit = result.pricePerUnit;
            row.regulationStatus = result.regulationStatus;
            row.regulationCategory = result.category;
            row.markupLimited = result.markupLimited;
            row.markupPercentUnknown = result.markupPercentUnknown;
            row.calcError = "";
            if (result.markupLimited) {
              row.markup = String(result.appliedMarkup);
            }

            try {
              await saveCalculation({
                name: row.name,
                category: result.category,
                purchasePrice: result.purchasePrice,
                weightOrVolume: row.weight,
                supplierMarkup: row.supplierMarkup,
                vat: row.vat,
                unit: row.unit,
                sortGrade: row.sortGrade,
                country: row.country,
                requestedMarkup: result.requestedMarkup,
                appliedMarkup: result.appliedMarkup,
                markupLimited: result.markupLimited,
                retailPrice: result.retailPrice,
                pricePerUnit: result.pricePerUnit,
                regulationStatus: result.regulationStatus,
              });
            } catch (dbError) {
              // Не блокируем расчёт, если запись в историю не удалась —
              // как и в оригинале (там это тоже best-effort try/except).
              console.error("Не удалось сохранить в историю:", dbError);
            }
          } catch (calcError) {
            row.calcError = calcError.message;
            errors.push(`«${row.name}»: ${calcError.message}`);
          }
        }

        this.statusMessage = errors.length
          ? "Расчёт завершён с ошибками."
          : "Расчёт цен выполнен успешно.";

        return { ok: errors.length === 0, errors };
      } finally {
        this.isBusy = false;
      }
    },

    reset() {
      this.rows = [emptyRow()];
      this.statusMessage = "Готово к работе.";
    },
  },
});
