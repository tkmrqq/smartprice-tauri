<script setup>
import { computed } from "vue";
import { usePriceCompareStore } from "../stores/priceCompare.js";

const props = defineProps({
  supplier: { type: Object, required: true },
});

const store = usePriceCompareStore();

const FIELD_LABELS = {
  name: "Название товара",
  barcode: "Штрихкод",
  priceNoVat: "Цена без НДС",
  priceWithVat: "Цена с НДС",
  vatRate: "Ставка НДС",
  packQty: "Кратность/уп.",
  weight: "Вес",
  country: "Страна",
};

const currentRows = computed(
  () => props.supplier.sheets.find((s) => s.name === props.supplier.sheetName)?.rows ?? []
);

const headerRow = computed(() => currentRows.value[props.supplier.headerRowIndex] ?? []);

const productCount = computed(() => store.supplierProducts(props.supplier.id).length);

function columnLabel(index) {
  const text = String(headerRow.value[index] ?? "").trim();
  return text ? `${index}: ${text}` : `Колонка ${index}`;
}

function columnOptions() {
  const width = Math.max(...currentRows.value.slice(0, 5).map((r) => r.length), headerRow.value.length);
  return Array.from({ length: width }, (_, i) => i);
}

function onFieldChange(field, event) {
  store.setColumn(props.supplier.id, field, event.target.value);
}

function onPriceBasisChange(event) {
  store.setPriceBasis(props.supplier.id, event.target.value || null);
}

function onSheetChange(event) {
  store.setSheet(props.supplier.id, event.target.value);
}

function onHeaderRowChange(event) {
  store.setHeaderRow(props.supplier.id, Number(event.target.value));
}
</script>

<template>
  <article class="card" :class="{ 'card-error': !!supplier.error }">
    <div class="card-head">
      <input
        :value="supplier.supplierName"
        type="text"
        class="supplier-name-input"
        @input="store.renameSupplier(supplier.id, $event.target.value)"
      />
      <button type="button" class="icon-btn" title="Убрать файл" @click="store.removeSupplier(supplier.id)">✕</button>
    </div>
    <p class="file-name">{{ supplier.fileName }}</p>

    <p v-if="supplier.error" class="field-error">{{ supplier.error }}</p>

    <div class="field-row" v-if="supplier.sheetNames.length > 1">
      <label class="field-label">Лист</label>
      <select :value="supplier.sheetName" class="field-select" @change="onSheetChange">
        <option v-for="name in supplier.sheetNames" :key="name" :value="name">{{ name }}</option>
      </select>
    </div>

    <div class="field-row">
      <label class="field-label">Строка шапки</label>
      <input
        :value="supplier.headerRowIndex"
        type="number"
        min="0"
        class="field-input-narrow"
        @change="onHeaderRowChange"
      />
    </div>

    <div class="mapping-grid">
      <div v-for="(label, field) in FIELD_LABELS" :key="field" class="field-row">
        <label class="field-label">{{ label }}</label>
        <select
          :value="supplier.columns[field] ?? ''"
          class="field-select"
          @change="onFieldChange(field, $event)"
        >
          <option value="">— не задано —</option>
          <option v-for="idx in columnOptions()" :key="idx" :value="idx">{{ columnLabel(idx) }}</option>
        </select>
      </div>
    </div>

    <div class="field-row">
      <label class="field-label">Сравнивать по</label>
      <select :value="supplier.priceBasis ?? ''" class="field-select" @change="onPriceBasisChange">
        <option value="">— выбрать колонку цены —</option>
        <option v-if="supplier.columns.priceNoVat != null" value="priceNoVat">Цена без НДС</option>
        <option v-if="supplier.columns.priceWithVat != null" value="priceWithVat">Цена с НДС</option>
      </select>
    </div>

    <p class="product-count">
      Найдено товаров: <strong>{{ productCount }}</strong>
    </p>
  </article>
</template>

<style scoped>
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 280px;
}

.card-error {
  border-color: var(--color-danger-line);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.supplier-name-input {
  flex: 1;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 4px 6px;
  background: transparent;
}
.supplier-name-input:hover,
.supplier-name-input:focus {
  border-color: var(--color-line);
  background: var(--color-paper);
}
.supplier-name-input:focus {
  outline: none;
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-brand-tint);
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--color-line-strong);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  font-size: 12px;
}
.icon-btn:hover {
  color: var(--color-danger);
  background: var(--color-danger-tint);
}

.file-name {
  font-size: 10.5px;
  color: var(--color-ink-muted);
  margin: 0;
  word-break: break-all;
}

.field-error {
  font-size: 12px;
  color: var(--color-danger);
  background: var(--color-danger-tint);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  margin: 0;
}

.mapping-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
  border-top: 1px solid var(--color-line);
  border-bottom: 1px solid var(--color-line);
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-size: 11.5px;
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.field-select {
  flex: 1;
  max-width: 62%;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  padding: 4px 6px;
  font-size: 12px;
  background: var(--color-paper);
}

.field-input-narrow {
  width: 60px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  padding: 4px 6px;
  font-size: 12px;
  background: var(--color-paper);
  text-align: right;
}

.product-count {
  font-size: 12px;
  color: var(--color-ink-muted);
  margin: 0;
}
</style>
