import { defineStore } from "pinia";
import { readWorkbook, detectColumnMapping, extractProducts } from "../lib/priceListParser.js";
import { matchAcrossSuppliers } from "../lib/priceMatcher.js";

let _nextId = 1;

/** "Крафт_Общий_прайс_22_07_551f7748_cd82_40b7_bef5_b88801d74092.xlsx" -> "Крафт Общий прайс 22 07" */
export function guessSupplierName(fileName) {
  const withoutExt = fileName.replace(/\.(xlsx|xls|xlsm)$/i, "");
  // Отрезаем хвост из технического UUID (8-4-4-4-12 hex, через "_" или
  // "-"), который добавляют системы вроде Google Drive/1С при экспорте.
  const withoutHash = withoutExt.replace(
    /[_-]+[0-9a-f]{8}[_-][0-9a-f]{4}[_-][0-9a-f]{4}[_-][0-9a-f]{4}[_-][0-9a-f]{12}$/i,
    ""
  );
  return withoutHash.replace(/_/g, " ").trim() || withoutExt;
}

const PRICE_BASIS_OPTIONS = ["priceNoVat", "priceWithVat"];

function pickDefaultPriceBasis(columns) {
  if (columns.priceNoVat != null) return "priceNoVat";
  if (columns.priceWithVat != null) return "priceWithVat";
  return null;
}

function buildSupplierEntry(fileName, workbookData) {
  const { sheets, sheetNames, defaultSheetName } = workbookData;
  const rows = sheets.find((s) => s.name === defaultSheetName)?.rows ?? [];
  const detection = detectColumnMapping(rows);

  return {
    id: _nextId++,
    fileName,
    supplierName: guessSupplierName(fileName),
    sheetNames,
    sheets, // { name, rows }[]
    sheetName: defaultSheetName,
    headerRowIndex: detection.headerRowIndex,
    columns: detection.columns, // {barcode, name, priceNoVat, priceWithVat, vatRate, packQty, country}
    priceBasis: pickDefaultPriceBasis(detection.columns),
    confidence: detection.confidence,
    error: detection.headerRowIndex === -1 ? "Не удалось автоматически определить колонки — укажите их вручную." : "",
  };
}

function computeProducts(supplier) {
  if (supplier.headerRowIndex === -1 || supplier.columns.name == null || !supplier.priceBasis) {
    return [];
  }
  const priceColumn = supplier.columns[supplier.priceBasis];
  if (priceColumn == null) return [];

  const rows = supplier.sheets.find((s) => s.name === supplier.sheetName)?.rows ?? [];
  return extractProducts(rows, supplier.headerRowIndex, { ...supplier.columns, priceColumn });
}

export const usePriceCompareStore = defineStore("priceCompare", {
  state: () => ({
    suppliers: [],
    results: [],
    hasCompared: false,
    onlyMultiSupplier: true,
  }),

  getters: {
    supplierProducts: (state) => (id) => {
      const supplier = state.suppliers.find((s) => s.id === id);
      return supplier ? computeProducts(supplier) : [];
    },
    visibleResults: (state) =>
      state.onlyMultiSupplier ? state.results.filter((g) => g.supplierCount > 1) : state.results,
    matchableCount: (state) => state.results.filter((g) => g.supplierCount > 1).length,
  },

  actions: {
    async addFiles(fileList) {
      for (const file of fileList) {
        try {
          const buffer = await file.arrayBuffer();
          const workbookData = readWorkbook(buffer);
          this.suppliers.push(buildSupplierEntry(file.name, workbookData));
        } catch (e) {
          this.suppliers.push({
            id: _nextId++,
            fileName: file.name,
            supplierName: guessSupplierName(file.name),
            sheetNames: [],
            sheets: [],
            sheetName: "",
            headerRowIndex: -1,
            columns: {},
            priceBasis: null,
            confidence: 0,
            error: `Не удалось прочитать файл: ${e.message || e}`,
          });
        }
      }
    },

    removeSupplier(id) {
      this.suppliers = this.suppliers.filter((s) => s.id !== id);
    },

    renameSupplier(id, name) {
      const s = this.suppliers.find((s) => s.id === id);
      if (s) s.supplierName = name;
    },

    setSheet(id, sheetName) {
      const s = this.suppliers.find((s) => s.id === id);
      if (!s) return;
      s.sheetName = sheetName;
      const rows = s.sheets.find((sh) => sh.name === sheetName)?.rows ?? [];
      const detection = detectColumnMapping(rows);
      s.headerRowIndex = detection.headerRowIndex;
      s.columns = detection.columns;
      s.priceBasis = pickDefaultPriceBasis(detection.columns);
      s.error =
        detection.headerRowIndex === -1
          ? "Не удалось автоматически определить колонки — укажите их вручную."
          : "";
    },

    setHeaderRow(id, rowIndex) {
      const s = this.suppliers.find((s) => s.id === id);
      if (s) s.headerRowIndex = rowIndex;
    },

    setColumn(id, field, columnIndex) {
      const s = this.suppliers.find((s) => s.id === id);
      if (!s) return;
      if (columnIndex === "" || columnIndex == null) {
        delete s.columns[field];
      } else {
        s.columns = { ...s.columns, [field]: Number(columnIndex) };
      }
      if ((field === "priceNoVat" || field === "priceWithVat") && !s.priceBasis) {
        s.priceBasis = pickDefaultPriceBasis(s.columns);
      }
    },

    setPriceBasis(id, basis) {
      const s = this.suppliers.find((s) => s.id === id);
      if (s) s.priceBasis = basis;
    },

    runComparison() {
      const datasets = this.suppliers
        .filter((s) => s.headerRowIndex !== -1 && s.priceBasis)
        .map((s) => ({ supplierName: s.supplierName, products: computeProducts(s) }));

      this.results = matchAcrossSuppliers(datasets);
      this.hasCompared = true;
    },

    reset() {
      this.suppliers = [];
      this.results = [];
      this.hasCompared = false;
    },
  },
});

export { PRICE_BASIS_OPTIONS };
