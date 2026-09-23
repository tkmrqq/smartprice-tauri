<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import * as XLSX from "xlsx";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { usePriceCompareStore } from "../stores/priceCompare.js";
import { useProductsStore } from "../stores/products.js";
import SupplierFileCard from "../components/SupplierFileCard.vue";

const store = usePriceCompareStore();
const productsStore = useProductsStore();
const router = useRouter();

const isDragging = ref(false);
const fileInput = ref(null);
const exportMessage = ref("");
const hasUnreviewedMatches = computed(() =>
  store.visibleResults.some((group) => group.needsReview && !group.reviewed)
);

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm"];

function isSpreadsheet(file) {
  return ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(isSpreadsheet);
  if (files.length) await store.addFiles(files);
}

function onDrop(event) {
  isDragging.value = false;
  const files = event.dataTransfer?.files;
  if (files?.length) handleFiles(files);
}

function onFileInputChange(event) {
  if (event.target.files?.length) handleFiles(event.target.files);
  event.target.value = "";
}

function openFilePicker() {
  fileInput.value?.click();
}

function formatMoney(value) {
  return Number(value).toFixed(2).replace(".", ",");
}

function reviewStatus(group) {
  if (group.matchType === "manual-split") return "Разделено вручную";
  if (group.reviewed) return "Подтверждено";
  return group.needsReview ? "Проверить" : "Автоматически";
}

function addToCalculator(group) {
  productsStore.addRow({
    name: group.displayName,
    purchasePrice: group.cheapest.price,
    weightOrVolume: group.cheapest.measure?.baseValue
      ? group.cheapest.measure.baseValue / 1000
      : undefined,
    unit: group.cheapest.measure?.dimension === "mass"
      ? "кг"
      : group.cheapest.measure?.dimension === "volume" ? "л" : undefined,
    vat: group.cheapest.vatRate != null ? group.cheapest.vatRate * 100 : undefined,
    country: group.cheapest.country || undefined,
  });
}

function addAllToCalculator() {
  if (hasUnreviewedMatches.value) return;
  for (const group of store.visibleResults) addToCalculator(group);
  router.push("/");
}

async function exportResults() {
  const date = new Date().toISOString().slice(0, 10);
  const path = await save({
    defaultPath: `Сравнение цен ${date}.xlsx`,
    filters: [{ name: "Книга Excel", extensions: ["xlsx"] }],
  });
  if (!path) return;

  const summaryRows = store.visibleResults.map((group) => ({
    Товар: group.displayName,
    Поставщик: group.cheapest.supplier,
    "Штрихкод": group.cheapest.barcode,
    "Цена упаковки, BYN": group.cheapest.price,
    "Цена сравнения, BYN": group.cheapest.comparisonPrice,
    "Единица сравнения": group.comparisonUnit,
    "Экономия, BYN": group.savingsAbs,
    "Экономия, %": group.savingsPct * 100,
    "Совпадение": group.matchType === "barcode" ? "Штрихкод" : "Название",
    "Уверенность, %": Math.round(group.matchConfidence * 100),
    "Статус проверки": reviewStatus(group),
  }));
  const offerRows = store.visibleResults.flatMap((group) => group.items.map((item) => ({
    Товар: group.displayName,
    "Название в прайсе": item.name,
    Поставщик: item.supplier,
    Штрихкод: item.barcode,
    Фасовка: item.measureLabel,
    "Цена упаковки, BYN": item.price,
    "Цена за кг/л, BYN": item.unitPrice,
    "Лучшая цена": item.identity === group.cheapest.identity ? "Да" : "",
    "Совпадение": group.matchType === "barcode" ? "Штрихкод" : "Название",
    "Уверенность, %": Math.round(group.matchConfidence * 100),
    "Статус проверки": reviewStatus(group),
    "НДС, %": item.vatRate == null ? "" : item.vatRate * 100,
    Страна: item.country,
  })));

  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  const offersSheet = XLSX.utils.json_to_sheet(offerRows);
  summarySheet["!cols"] = [34, 24, 18, 18, 18, 20, 16, 14, 16, 16, 20].map((wch) => ({ wch }));
  offersSheet["!cols"] = [34, 42, 24, 18, 14, 18, 18, 14, 16, 16, 20, 12, 18].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Рекомендации");
  XLSX.utils.book_append_sheet(workbook, offersSheet, "Все предложения");

  try {
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    await writeFile(path, new Uint8Array(bytes));
    exportMessage.value = "Excel-файл сохранён.";
  } catch (error) {
    exportMessage.value = `Не удалось сохранить Excel-файл: ${error?.message ?? error}`;
  }
}
</script>

<template>
  <section class="view">
    <h1 class="page-title">Сравнение прайсов поставщиков</h1>
    <p class="page-subtitle">
      Загрузите прайс-листы нескольких поставщиков (.xlsx/.xls) — колонки определятся
      автоматически, но их можно поправить вручную. Товары сопоставляются в первую очередь по
      штрихкоду, а без него — по похожести названия. В таблице показаны цены упаковок из прайсов;
      фасовка учитывает количество штук в упаковке.
    </p>

    <div
      class="dropzone"
      :class="{ 'dropzone-active': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
      @click="openFilePicker"
    >
      <input
        ref="fileInput"
        type="file"
        accept=".xlsx,.xls,.xlsm"
        multiple
        class="hidden-input"
        @change="onFileInputChange"
      />
      <p class="dropzone-text">
        Перетащите файлы прайсов сюда или <span class="dropzone-link">выберите файлы</span>
      </p>
      <p class="dropzone-hint">.xlsx, .xls — можно сразу несколько</p>
    </div>

    <div v-if="store.suppliers.length" class="supplier-cards">
      <SupplierFileCard v-for="s in store.suppliers" :key="s.id" :supplier="s" />
    </div>

    <div v-if="store.suppliers.length >= 1" class="actions-row">
      <button type="button" class="btn btn-primary" @click="store.runComparison()">
        Сравнить цены
      </button>
      <button
        v-if="store.suppliers.length"
        type="button"
        class="btn btn-ghost"
        @click="store.reset()"
      >
        Очистить всё
      </button>
    </div>

    <template v-if="store.hasCompared">
      <div class="results-header">
        <h2 class="results-title">
          Результат сравнения
          <span class="results-count">({{ store.visibleResults.length }} позиций показано)</span>
        </h2>
        <div class="filter-control">
          <label class="toggle">
            <input type="checkbox" v-model="store.onlyMultiSupplier" />
            Только найденные у нескольких поставщиков
          </label>
          <small>{{ store.onlyMultiSupplier ? 'Одиночные позиции скрыты' : 'Включая товары, найденные только в одном прайсе' }}</small>
        </div>
        <button
          v-if="store.visibleResults.length"
          type="button"
          class="btn btn-ghost"
          :disabled="hasUnreviewedMatches"
          :title="hasUnreviewedMatches ? 'Сначала проверьте сомнительные совпадения' : ''"
          @click="addAllToCalculator"
        >
          {{ hasUnreviewedMatches ? "Сначала проверьте совпадения" : "Добавить всё в расчёт →" }}
        </button>
        <button
          v-if="store.visibleResults.length"
          type="button"
          class="btn btn-ghost"
          @click="exportResults"
        >
          Экспорт в Excel
        </button>
      </div>

      <p v-if="store.reviewMessage || exportMessage" class="action-message">
        {{ store.reviewMessage || exportMessage }}
      </p>

      <div class="table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th class="col-name">Товар</th>
              <th class="col-match">Сопоставление</th>
              <th class="col-suppliers">Цены поставщиков</th>
              <th class="col-best">Лучшая цена за упаковку</th>
              <th class="col-savings">Разница цен</th>
              <th class="col-action" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in store.visibleResults" :key="group.decisionKey" :class="{ 'row-review': group.needsReview && !group.reviewed }">
              <td class="cell-name">{{ group.displayName }}</td>
              <td>
                <span class="match-badge" :class="group.matchType">
                  {{ group.matchType === "barcode" ? "по штрихкоду" : group.matchType === "manual-split" ? "разделено" : "по названию" }}
                  · {{ Math.round(group.matchConfidence * 100) }}%
                </span>
                <div v-if="group.needsReview && !group.reviewed">
                  <p v-for="reason in group.reviewReasons" :key="reason" class="match-warning">{{ reason }}</p>
                </div>
                <div v-if="group.needsReview && !group.reviewed" class="review-actions">
                  <button type="button" class="link-btn" @click="store.confirmMatch(group.decisionKey)">Это один товар</button>
                  <button type="button" class="link-btn link-btn-muted" @click="store.separateMatch(group.decisionKey)">Разделить</button>
                </div>
              </td>
              <td>
                <ul class="supplier-prices">
                  <li
                    v-for="item in group.items"
                    :key="item.supplier + item.price"
                    :class="{ 'is-cheapest': item === group.cheapest }"
                  >
                    <span class="supplier-name">{{ item.supplier }}</span>
                    <span class="supplier-offer-prices">
                      <span class="tabular supplier-price">{{ formatMoney(item.price) }} / уп.</span>
                      <small v-if="item.measureLabel" class="unit-price-note">{{ item.measureLabel }}</small>
                    </span>
                  </li>
                </ul>
                <span v-if="group.reviewed" class="reviewed-note">Проверено вручную</span>
              </td>
              <td class="tabular cell-num cell-best">{{ formatMoney(group.cheapest.price) }} / уп.</td>
              <td class="tabular cell-num">
                <span v-if="group.supplierCount > 1" class="savings">
                  −{{ formatMoney(group.savingsAbs) }} BYN ({{ (group.savingsPct * 100).toFixed(0) }}%)
                </span>
                <span v-else class="cell-muted">—</span>
              </td>
              <td class="cell-action">
                <button type="button" class="link-btn" :disabled="group.needsReview && !group.reviewed" @click="addToCalculator(group)">
                  В расчёт →
                </button>
              </td>
            </tr>
            <tr v-if="!store.visibleResults.length">
              <td colspan="6" class="empty-cell">
                {{ store.onlyMultiSupplier
                  ? 'Нет товаров, найденных у нескольких поставщиков. Проверьте сопоставление колонок или снимите фильтр.'
                  : 'В загруженных прайсах нет товаров для отображения.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
}

.page-title {
  font-size: 22px;
}

.page-subtitle {
  margin: 0;
  font-size: 12.5px;
  color: var(--color-ink-muted);
  max-width: 80ch;
  line-height: 1.5;
}

.dropzone {
  border: 2px dashed var(--color-line-strong);
  border-radius: var(--radius-md);
  padding: 28px;
  text-align: center;
  cursor: pointer;
  background: var(--color-surface);
  transition: border-color 0.12s ease, background 0.12s ease;
}
.dropzone:hover,
.dropzone-active {
  border-color: var(--color-brand);
  background: var(--color-brand-tint);
}

.hidden-input {
  display: none;
}

.dropzone-text {
  margin: 0;
  font-size: 14px;
  color: var(--color-ink);
}
.dropzone-link {
  color: var(--color-brand-dark);
  font-weight: 600;
  text-decoration: underline;
}
.dropzone-hint {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: var(--color-ink-muted);
}

.supplier-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.actions-row {
  display: flex;
  gap: 8px;
}

.btn {
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn-primary {
  background: var(--color-brand);
  border-color: var(--color-brand);
  color: #fff;
}
.btn-primary:hover {
  background: var(--color-brand-dark);
}
.btn-ghost {
  color: var(--color-ink-muted);
}
.btn-ghost:hover {
  background: var(--color-paper);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.action-message {
  margin: -6px 0 0;
  color: var(--color-ink-muted);
  font-size: 12px;
}

.results-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.results-title {
  font-size: 16px;
}
.results-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-ink-muted);
}

.filter-control {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.filter-control small {
  padding-left: 22px;
  color: var(--color-ink-muted);
  font-size: 10px;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--color-ink-muted);
  cursor: pointer;
}

.table-wrap {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  overflow: auto;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.results-table {
  width: 100%;
  min-width: 1050px;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}

.col-name {
  width: 25%;
}
.col-match {
  width: 14%;
}
.col-suppliers {
  width: 27%;
}
.col-best {
  width: 13%;
}
.col-savings {
  width: 13%;
}
.col-action {
  width: 8%;
}

thead th {
  position: sticky;
  top: 0;
  background: var(--color-paper);
  border-bottom: 1px solid var(--color-line);
  text-align: left;
  padding: 9px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-ink-muted);
}

tbody td {
  border-bottom: 1px solid var(--color-line);
  padding: 8px 10px;
  vertical-align: top;
}

.row-review {
  background: color-mix(in srgb, var(--color-warning-tint) 36%, transparent);
}

.cell-name {
  font-weight: 500;
}

.match-badge {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  white-space: nowrap;
}
.match-badge.barcode {
  background: var(--color-brand-tint);
  color: var(--color-brand-dark);
}
.match-badge.name {
  background: var(--color-warning-tint);
  color: var(--color-warning);
}
.match-badge.manual-split {
  background: var(--color-paper);
  color: var(--color-ink-muted);
}

.match-warning {
  margin: 5px 0 0;
  max-width: 180px;
  color: var(--color-warning);
  font-size: 10px;
  line-height: 1.35;
}

.review-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  margin-top: 5px;
}

.reviewed-note {
  display: inline-block;
  margin: 5px 4px 0;
  color: var(--color-brand-dark);
  font-size: 11px;
  font-weight: 500;
}

.supplier-prices {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.supplier-prices li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}
.supplier-prices li.is-cheapest {
  background: var(--color-brand-tint);
  font-weight: 600;
  color: var(--color-brand-dark);
}
.supplier-name {
  color: var(--color-ink-muted);
}
.supplier-offer-prices {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}
.unit-price-note {
  color: var(--color-ink-muted);
  font-size: 10px;
  font-weight: 400;
}
.is-cheapest .supplier-name {
  color: var(--color-brand-dark);
}

.cell-num {
  text-align: right;
}
.cell-best {
  font-weight: 700;
  color: var(--color-brand-dark);
}
.savings {
  color: var(--color-brand-dark);
  font-weight: 600;
}
.cell-muted {
  color: var(--color-line-strong);
}

.cell-action {
  text-align: right;
}
.link-btn {
  border: none;
  background: transparent;
  color: var(--color-brand-dark);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.link-btn:hover {
  text-decoration: underline;
}
.link-btn:disabled {
  color: var(--color-line-strong);
  cursor: not-allowed;
  text-decoration: none;
}
.link-btn-muted {
  color: var(--color-ink-muted);
}

.empty-cell {
  text-align: center;
  color: var(--color-ink-muted);
  padding: 28px 10px;
}
</style>
