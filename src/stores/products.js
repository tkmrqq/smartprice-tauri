import { defineStore } from "pinia";
import { calculateBelarusPrice } from "../lib/calculator.js";
import { saveCalculation, getCatalogByBarcodes, upsertCatalogFromCalculation } from "../lib/db.js";
import { catalogKey, mergeWithCatalog, buildCatalogRecord } from "../lib/catalog.js";

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
    barcode: "",
    purchasePrice: "",
    weight: DEFAULTS.weight,
    unit: DEFAULTS.unit,
    supplierMarkup: DEFAULTS.supplierMarkup,
    markup: DEFAULTS.markup,
    vat: DEFAULTS.vat,
    sortGrade: "",
    country: DEFAULTS.country,
    // Закупка по прошлому расчёту этого товара (из справочника) — для значка роста/падения
    prevPurchasePrice: "",
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
        barcode: overrides.barcode != null ? String(overrides.barcode).trim() : "",
        purchasePrice: overrides.purchasePrice != null ? String(overrides.purchasePrice) : "",
        weight: formatWeight(weightOrVolume),
        unit: guessUnit(weightOrVolume, overrides.unit),
        vat: overrides.vat != null ? String(overrides.vat) : DEFAULTS.vat,
        country: overrides.country || DEFAULTS.country,
        markup: overrides.markup != null && overrides.markup !== "" ? String(overrides.markup) : DEFAULTS.markup,
        supplierMarkup:
          overrides.supplierMarkup != null && overrides.supplierMarkup !== ""
            ? String(overrides.supplierMarkup)
            : DEFAULTS.supplierMarkup,
        sortGrade: overrides.sortGrade != null ? String(overrides.sortGrade) : "",
        prevPurchasePrice: overrides.prevPurchasePrice != null ? String(overrides.prevPurchasePrice) : "",
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

    /**
     * Импорт из накладной ЭДИН, фото или сравнения прайсов — все дают одинаковую
     * форму товара. Если товар (по штрихкоду) уже есть в справочнике, из него
     * подставляются наценки, сорт, вес и единица, а также прошлая закупка.
     * @returns {Promise<{added: number, filled: number}>}
     */
    async importProducts(products) {
      let catalog = new Map();
      try {
        catalog = await getCatalogByBarcodes(products.map((p) => catalogKey(p.barcode)));
      } catch (e) {
        // Справочник — удобство, а не обязательное условие: без него просто
        // импортируем как раньше.
        console.error("Справочник недоступен:", e);
      }

      let filled = 0;
      for (const p of products) {
        const { product, filled: wasFilled } = mergeWithCatalog(p, catalog.get(catalogKey(p.barcode)));
        if (wasFilled) filled += 1;
        this.addRow(product);
      }
      return { added: products.length, filled };
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
                barcode: row.barcode,
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

            // Запоминаем товар в справочнике (только если есть штрихкод)
            try {
              const record = buildCatalogRecord(row, result);
              if (record) await upsertCatalogFromCalculation(record);
            } catch (catalogError) {
              console.error("Не удалось сохранить в справочник:", catalogError);
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
