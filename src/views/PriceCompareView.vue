<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { usePriceCompareStore } from "../stores/priceCompare.js";
import { useProductsStore } from "../stores/products.js";
import SupplierFileCard from "../components/SupplierFileCard.vue";

const store = usePriceCompareStore();
const productsStore = useProductsStore();
const router = useRouter();

const isDragging = ref(false);
const fileInput = ref(null);

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
  return value.toFixed(2).replace(".", ",");
}

function addToCalculator(group) {
  productsStore.addRow({
    name: group.displayName,
    purchasePrice: group.cheapest.price,
    weightOrVolume: undefined,
    unit: undefined,
    vat: group.cheapest.vatRate != null ? group.cheapest.vatRate * 100 : undefined,
    country: group.cheapest.country || undefined,
  });
}

function addAllToCalculator() {
  for (const group of store.visibleResults) addToCalculator(group);
  router.push("/");
}
</script>

<template>
  <section class="view">
    <h1 class="page-title">Сравнение прайсов поставщиков</h1>
    <p class="page-subtitle">
      Загрузите прайс-листы нескольких поставщиков (.xlsx/.xls) — колонки определятся
      автоматически, но их можно поправить вручную. Товары сопоставляются в первую очередь по
      штрихкоду, а без него — по похожести названия.
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
          <span class="results-count">({{ store.matchableCount }} товаров у ≥2 поставщиков)</span>
        </h2>
        <label class="toggle">
          <input type="checkbox" v-model="store.onlyMultiSupplier" />
          Только товары, встречающиеся у нескольких поставщиков
        </label>
        <button
          v-if="store.visibleResults.length"
          type="button"
          class="btn btn-ghost"
          @click="addAllToCalculator"
        >
          Добавить всё в расчёт →
        </button>
      </div>

      <div class="table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th class="col-name">Товар</th>
              <th class="col-match">Сопоставление</th>
              <th class="col-suppliers">Цены поставщиков</th>
              <th class="col-num">Лучшая цена</th>
              <th class="col-num">Экономия</th>
              <th class="col-action" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in store.visibleResults" :key="group.key">
              <td class="cell-name">{{ group.displayName }}</td>
              <td>
                <span class="match-badge" :class="group.matchType">
                  {{ group.matchType === "barcode" ? "по штрихкоду" : "по названию" }}
                </span>
              </td>
              <td>
                <ul class="supplier-prices">
                  <li
                    v-for="item in group.items"
                    :key="item.supplier + item.price"
                    :class="{ 'is-cheapest': item === group.cheapest }"
                  >
                    <span class="supplier-name">{{ item.supplier }}</span>
                    <span class="tabular supplier-price">{{ formatMoney(item.price) }}</span>
                  </li>
                </ul>
              </td>
              <td class="tabular cell-num cell-best">{{ formatMoney(group.cheapest.price) }}</td>
              <td class="tabular cell-num">
                <span v-if="group.supplierCount > 1" class="savings">
                  −{{ formatMoney(group.savingsAbs) }} ({{ (group.savingsPct * 100).toFixed(0) }}%)
                </span>
                <span v-else class="cell-muted">—</span>
              </td>
              <td class="cell-action">
                <button type="button" class="link-btn" @click="addToCalculator(group)">
                  В расчёт →
                </button>
              </td>
            </tr>
            <tr v-if="!store.visibleResults.length">
              <td colspan="6" class="empty-cell">
                Нет товаров, совпадающих у нескольких поставщиков. Проверьте сопоставление колонок
                выше или снимите фильтр.
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
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}

.col-name {
  width: 26%;
}
.col-match {
  width: 10%;
}
.col-suppliers {
  width: 28%;
}
.col-num {
  width: 12%;
}
.col-action {
  width: 10%;
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

.empty-cell {
  text-align: center;
  color: var(--color-ink-muted);
  padding: 28px 10px;
}
</style>
