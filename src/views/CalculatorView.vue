<script setup>
import { ref } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useProductsStore } from "../stores/products.js";
import { useSettingsStore } from "../stores/settings.js";
import { parseEdinXml } from "../lib/edinParser.js";
import { extractProductsFromInvoicePhoto } from "../lib/visionOcr.js";
import { buildLabelsHtml } from "../lib/priceLabels.js";
import Toolbar from "../components/Toolbar.vue";
import ProductsTable from "../components/ProductsTable.vue";

const products = useProductsStore();
const settings = useSettingsStore();
const localError = ref("");

function clearError() {
  localError.value = "";
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

    products.importProducts(parsed);

    const parts = [];
    if (meta.documentId) parts.push(meta.documentId);
    if (meta.shipperName) {
      const short = meta.shipperName.length > 40 ? `${meta.shipperName.slice(0, 40)}...` : meta.shipperName;
      parts.push(`«${short}»`);
    }
    const extra = parts.length ? ` (${parts.join(", ")})` : "";
    products.statusMessage = `Импортировано из ЭДИН: ${parsed.length} товаров${extra}. Проверьте данные перед расчётом.`;
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

    products.importProducts(parsed);
    products.statusMessage = `Распознано товаров: ${parsed.length}. Проверьте данные перед расчётом.`;
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
  const rowsData = products.rows
    .filter((r) => r.name.trim() && r.retailPrice)
    .map((r) => ({
      name: r.name,
      retailPrice: r.retailPrice,
      pricePerUnit: r.pricePerUnit,
      unit: r.unit,
      weight: r.weight,
      sortGrade: r.sortGrade,
      country: r.country,
    }));

  if (!rowsData.length) {
    localError.value = "Сначала выполните расчёт цен для хотя бы одного товара.";
    return;
  }

  const savePath = await save({
    title: "Сохранить ценники",
    defaultPath: "labels.html",
    filters: [{ name: "HTML файлы", extensions: ["html"] }],
  });
  if (!savePath) return;

  try {
    await writeTextFile(savePath, buildLabelsHtml(rowsData));
    products.statusMessage = `Ценники сохранены: ${savePath}`;
  } catch (e) {
    localError.value = `Ошибка сохранения: ${e.message || e}`;
  }
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

    <p class="status-line">{{ products.statusMessage }}</p>
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

.status-line {
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--color-ink-muted);
}
</style>
