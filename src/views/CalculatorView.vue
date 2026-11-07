<script setup>
import { ref, onMounted } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useProductsStore } from "../stores/products.js";
import { useSettingsStore } from "../stores/settings.js";
import { parseEdinXml } from "../lib/edinParser.js";
import { extractProductsFromInvoicePhoto } from "../lib/visionOcr.js";
import { buildLabelsHtml } from "../lib/priceLabels.js";
import { setupTableDraft, clearDraft } from "../lib/tableDraft.js";
import { getCatalogByBarcodes, markLabelsPrinted } from "../lib/db.js";
import { catalogKey, needsReprint } from "../lib/catalog.js";
import Toolbar from "../components/Toolbar.vue";
import ProductsTable from "../components/ProductsTable.vue";

const products = useProductsStore();
const settings = useSettingsStore();
const localError = ref("");

// Печатать ценники только по тем товарам, у которых розничная цена отличается
// от напечатанной в прошлый раз (или товар печатается впервые).
const ONLY_CHANGED_KEY = "smartprice.onlyChangedLabels";
const onlyChangedLabels = ref(localStorage.getItem(ONLY_CHANGED_KEY) === "1");

function onOnlyChangedToggle() {
  try {
    localStorage.setItem(ONLY_CHANGED_KEY, onlyChangedLabels.value ? "1" : "0");
  } catch {
    /* не критично */
  }
}

function catalogNote(filled) {
  return filled ? ` Подставлено из справочника: ${filled}.` : "";
}

function clearError() {
  localError.value = "";
}

// Автосохранение текущей таблицы (в т.ч. нерассчитанной): при запуске
// подтягиваем прошлый черновик, дальше он обновляется сам при любой правке.
onMounted(() => {
  const restored = setupTableDraft(products);
  if (restored) {
    products.statusMessage = `Восстановлена таблица с прошлого сеанса: ${restored} строк.`;
  }
});

function handleClearTable() {
  const confirmed = window.confirm("Очистить таблицу? Все введённые строки будут удалены.");
  if (!confirmed) return;
  clearError();
  products.reset();
  clearDraft();
}

async function handleImportEdin() {
  clearError();
  const filePath = await open({
    title: "Выберите накладную ЭДИН",
    filters: [{ name: "XML накладные", extensions: ["xml"] }],
    multiple: false,
  });
  if (!filePath) return;

  products.isBusy = true;
  try {
    const xmlText = await readTextFile(filePath);
    const { meta, products: parsed } = parseEdinXml(xmlText);

    if (!parsed.length) {
      products.statusMessage = "В накладной не найдено товаров (LineItem с признаком PROD).";
      return;
    }

    const { filled } = await products.importProducts(parsed);

    const parts = [];
    if (meta.documentId) parts.push(meta.documentId);
    if (meta.shipperName) {
      const short = meta.shipperName.length > 40 ? `${meta.shipperName.slice(0, 40)}...` : meta.shipperName;
      parts.push(`«${short}»`);
    }
    const extra = parts.length ? ` (${parts.join(", ")})` : "";
    products.statusMessage = `Импортировано из ЭДИН: ${parsed.length} товаров${extra}.${catalogNote(filled)} Проверьте данные перед расчётом.`;
  } catch (e) {
    localError.value = `Ошибка импорта ЭДИН: ${e.message || e}`;
  } finally {
    products.isBusy = false;
  }
}

async function handleImportPhoto() {
  clearError();
  if (!settings.hasVisionKey) {
    localError.value =
      "Не задан ключ Google Vision API. Откройте «Настройки» и добавьте ключ, чтобы распознавать фото накладных.";
    return;
  }

  const filePath = await open({
    title: "Выберите фото накладной",
    filters: [{ name: "Изображения", extensions: ["jpg", "jpeg", "png"] }],
    multiple: false,
  });
  if (!filePath) return;

  products.isBusy = true;
  products.statusMessage = "Распознавание накладной...";
  try {
    const parsed = await extractProductsFromInvoicePhoto(filePath, {
      apiKey: settings.visionApiKey,
    });

    if (!parsed.length) {
      products.statusMessage = "Не удалось распознать товары на изображении.";
      return;
    }

    const { filled } = await products.importProducts(parsed);
    products.statusMessage = `Распознано товаров: ${parsed.length}.${catalogNote(filled)} Проверьте данные перед расчётом.`;
  } catch (e) {
    localError.value = `Ошибка распознавания: ${e.message || e}`;
    products.statusMessage = "Операция завершилась с ошибкой.";
  } finally {
    products.isBusy = false;
  }
}

async function handleCalculate() {
  clearError();
  const { ok, errors } = await products.calculateAll();
  if (!ok && errors.length) {
    localError.value = errors.join("\n");
  }
}

async function handleGenerateLabels() {
  clearError();
  const calculated = products.rows.filter((r) => r.name.trim() && r.retailPrice);

  if (!calculated.length) {
    localError.value = "Сначала выполните расчёт цен для хотя бы одного товара.";
    return;
  }

  let chosen = calculated;
  if (onlyChangedLabels.value) {
    let catalog = new Map();
    try {
      catalog = await getCatalogByBarcodes(calculated.map((r) => catalogKey(r.barcode)));
    } catch (e) {
      console.error("Справочник недоступен, печатаем все ценники:", e);
    }
    chosen = calculated.filter((r) => needsReprint(r, catalog.get(catalogKey(r.barcode))));
    if (!chosen.length) {
      localError.value = "Все цены совпадают с ранее напечатанными — печатать нечего. Снимите галочку, чтобы напечатать всё.";
      return;
    }
  }

  const rowsData = chosen.map((r) => ({
    name: r.name,
    barcode: r.barcode,
    retailPrice: r.retailPrice,
    pricePerUnit: r.pricePerUnit,
    unit: r.unit,
    weight: r.weight,
    sortGrade: r.sortGrade,
    country: r.country,
  }));

  const savePath = await save({
    title: "Сохранить ценники",
    defaultPath: "labels.html",
    filters: [{ name: "HTML файлы", extensions: ["html"] }],
  });
  if (!savePath) return;

  try {
    await writeTextFile(
      savePath,
      buildLabelsHtml(rowsData, {
        companyName: settings.companyName,
        companyUnp: settings.companyUnp,
        printBarcode: settings.printBarcode,
      })
    );
  } catch (e) {
    localError.value = `Ошибка сохранения: ${e.message || e}`;
    return;
  }

  // Файл сохранён — считаем, что эти цены ушли на ценники.
  try {
    await markLabelsPrinted(rowsData);
  } catch (e) {
    console.error("Не удалось запомнить напечатанные цены:", e);
  }

  const skipped = calculated.length - rowsData.length;
  const skippedNote = skipped ? ` (пропущено без изменений: ${skipped})` : "";
  products.statusMessage = `Ценники сохранены: ${rowsData.length} шт${skippedNote} — ${savePath}`;
}
</script>

<template>
  <section class="view">
    <h1 class="page-title">Расчёт розничных цен</h1>

    <Toolbar
      :busy="products.isBusy"
      @add-row="products.addRow()"
      @import-edin="handleImportEdin"
      @import-photo="handleImportPhoto"
      @calculate="handleCalculate"
      @generate-labels="handleGenerateLabels"
    />

    <div v-if="localError" class="alert alert-danger">{{ localError }}</div>

    <ProductsTable />

    <div class="footer-row">
      <p class="status-line">{{ products.statusMessage }}</p>
      <div class="footer-actions">
        <label class="only-changed" title="Печатать ценники только для товаров, у которых розничная цена изменилась с прошлой печати">
          <input v-model="onlyChangedLabels" type="checkbox" @change="onOnlyChangedToggle" />
          Ценники только по изменившимся
        </label>
        <button type="button" class="btn-clear" @click="handleClearTable">Очистить таблицу</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.page-title {
  font-size: 22px;
  margin-bottom: 6px;
}

.alert {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  white-space: pre-line;
  margin-bottom: 10px;
}

.alert-danger {
  background: var(--color-danger-tint);
  border: 1px solid var(--color-danger-line);
  color: var(--color-danger);
}

.footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.status-line {
  margin: 0;
  font-size: 12.5px;
  color: var(--color-ink-muted);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.only-changed {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-ink-muted);
  cursor: pointer;
}
.only-changed input {
  accent-color: var(--color-brand);
}

.btn-clear {
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  color: var(--color-ink-muted);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}
.btn-clear:hover {
  color: var(--color-danger);
  border-color: var(--color-danger-line);
}
</style>
