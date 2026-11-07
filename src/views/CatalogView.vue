<script setup>
import { ref, onMounted, computed } from "vue";
import { listCatalog, saveCatalogEdit, deleteCatalogEntry } from "../lib/db.js";
import { parseCreatedAt } from "../lib/historyGroups.js";

const items = ref([]);
const query = ref("");
const isLoading = ref(false);
const errorMessage = ref("");
const savedBarcode = ref("");
let savedTimer = null;
let searchTimer = null;

async function load() {
  isLoading.value = true;
  errorMessage.value = "";
  try {
    items.value = await listCatalog(query.value);
  } catch (e) {
    errorMessage.value = `Не удалось загрузить справочник: ${e.message || e}`;
  } finally {
    isLoading.value = false;
  }
}

function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 200);
}

// Правка сохраняется сразу после выхода из поля (change)
async function saveItem(item) {
  try {
    await saveCatalogEdit(item.barcode, item);
    savedBarcode.value = item.barcode;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (savedBarcode.value = ""), 1800);
  } catch (e) {
    errorMessage.value = `Не удалось сохранить: ${e.message || e}`;
  }
}

async function removeItem(item) {
  const confirmed = window.confirm(`Удалить «${item.name}» из справочника? История расчётов не пострадает.`);
  if (!confirmed) return;
  await deleteCatalogEntry(item.barcode);
  await load();
}

function formatUpdated(value) {
  const date = parseCreatedAt(value);
  return date ? date.toLocaleDateString("ru-RU") : "—";
}

const hasItems = computed(() => items.value.length > 0);

onMounted(load);
</script>

<template>
  <section class="view">
    <div class="header-row">
      <div>
        <h1 class="page-title">Справочник товаров</h1>
        <p class="page-subtitle">
          Пополняется сам: после расчёта товара со штрихкодом его наценки, страна, вес и сорт
          запоминаются и подставляются при следующем импорте накладной или прайса.
        </p>
      </div>
      <div class="header-actions">
        <span class="count">Товаров: {{ items.length }}</span>
        <input
          v-model="query"
          type="text"
          class="search-input"
          placeholder="Поиск по названию или штрихкоду..."
          @input="onSearchInput"
        />
      </div>
    </div>

    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <div class="table-wrap">
      <table class="catalog-table">
        <thead>
          <tr>
            <th>Штрихкод</th>
            <th class="col-name">Название</th>
            <th>Страна</th>
            <th class="col-small">Ед.</th>
            <th class="col-small">Вес</th>
            <th class="col-small">НДС, %</th>
            <th>Сорт/вид</th>
            <th class="col-small">Нац. пост., %</th>
            <th class="col-small">Торг. наценка, %</th>
            <th class="col-money">Закупка</th>
            <th class="col-money">Розница</th>
            <th>Обновлён</th>
            <th class="col-action" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.barcode" :class="{ 'row-saved': savedBarcode === item.barcode }">
            <td class="tabular cell-barcode">{{ item.barcode }}</td>
            <td><input v-model="item.name" type="text" class="cell-input cell-name" @change="saveItem(item)" /></td>
            <td><input v-model="item.country" type="text" class="cell-input" @change="saveItem(item)" /></td>
            <td>
              <select v-model="item.unit" class="cell-input" @change="saveItem(item)">
                <option value="">—</option>
                <option value="шт">шт</option>
                <option value="кг">кг</option>
                <option value="л">л</option>
              </select>
            </td>
            <td><input v-model="item.weight" type="text" class="cell-input tabular cell-num" @change="saveItem(item)" /></td>
            <td><input v-model="item.vat" type="text" class="cell-input tabular cell-num" @change="saveItem(item)" /></td>
            <td><input v-model="item.sort_grade" type="text" class="cell-input" @change="saveItem(item)" /></td>
            <td>
              <input v-model="item.supplier_markup" type="text" class="cell-input tabular cell-num" @change="saveItem(item)" />
            </td>
            <td><input v-model="item.markup" type="text" class="cell-input tabular cell-num" @change="saveItem(item)" /></td>
            <td class="tabular cell-num cell-readonly">{{ item.last_purchase_price || "—" }}</td>
            <td class="tabular cell-num cell-readonly cell-strong">{{ item.last_retail_price || "—" }}</td>
            <td class="cell-readonly cell-date">{{ formatUpdated(item.updated_at) }}</td>
            <td class="cell-action">
              <button type="button" class="icon-btn" title="Удалить из справочника" @click="removeItem(item)">✕</button>
            </td>
          </tr>
          <tr v-if="!isLoading && !hasItems">
            <td colspan="13" class="empty-cell">
              {{
                query
                  ? "Ничего не найдено."
                  : "Справочник пока пуст. Рассчитайте товары со штрихкодом — и они появятся здесь."
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  font-size: 22px;
}

.page-subtitle {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--color-ink-muted);
  max-width: 70ch;
  line-height: 1.5;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.count {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.search-input {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  min-width: 280px;
  background: var(--color-surface);
}
.search-input:focus {
  outline: none;
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-brand-tint);
}

.alert-danger {
  background: var(--color-danger-tint);
  border: 1px solid var(--color-danger-line);
  color: var(--color-danger);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.table-wrap {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  overflow: auto;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.catalog-table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
  font-size: 13px;
}

thead th {
  position: sticky;
  top: 0;
  background: var(--color-paper);
  border-bottom: 1px solid var(--color-line);
  text-align: left;
  padding: 9px 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-ink-muted);
  white-space: nowrap;
  z-index: 1;
}

.col-name {
  min-width: 240px;
}
.col-small {
  width: 84px;
}
.col-money {
  width: 90px;
  text-align: right;
}
.col-action {
  width: 34px;
}

tbody td {
  border-bottom: 1px solid var(--color-line);
  padding: 3px 5px;
  vertical-align: middle;
}

tbody tr.row-saved td {
  background: var(--color-brand-tint);
  transition: background 0.3s ease;
}

.cell-barcode {
  padding: 3px 8px;
  font-size: 12px;
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.cell-input {
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  padding: 6px 7px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--color-ink);
  font-family: inherit;
}
.cell-input:hover {
  border-color: var(--color-line);
}
.cell-input:focus {
  border-color: var(--color-brand);
  background: var(--color-surface);
  outline: none;
  box-shadow: 0 0 0 3px var(--color-brand-tint);
}

.cell-name {
  font-weight: 500;
}
.cell-num {
  text-align: right;
}
.cell-readonly {
  padding: 3px 8px;
}
.cell-strong {
  font-weight: 600;
}
.cell-date {
  font-size: 12px;
  color: var(--color-ink-muted);
  white-space: nowrap;
}

.cell-action {
  text-align: center;
}
.icon-btn {
  border: none;
  background: transparent;
  color: var(--color-line-strong);
  cursor: pointer;
  font-size: 13px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
}
.icon-btn:hover {
  color: var(--color-danger);
  background: var(--color-danger-tint);
}

.empty-cell {
  text-align: center;
  color: var(--color-ink-muted);
  padding: 32px 10px;
}
</style>
