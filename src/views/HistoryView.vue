<script setup>
import { ref, onMounted, computed } from "vue";
import { getAllHistory, searchHistoryByName, deleteEntry, clearHistory } from "../lib/db.js";
import { useProductsStore } from "../stores/products.js";
import { useRouter } from "vue-router";
import StatusChip from "../components/StatusChip.vue";

const products = useProductsStore();
const router = useRouter();

const entries = ref([]);
const query = ref("");
const isLoading = ref(false);
const errorMessage = ref("");

async function load() {
  isLoading.value = true;
  errorMessage.value = "";
  try {
    entries.value = query.value.trim()
      ? await searchHistoryByName(query.value)
      : await getAllHistory();
  } catch (e) {
    errorMessage.value = `Не удалось загрузить историю: ${e.message || e}`;
  } finally {
    isLoading.value = false;
  }
}

let searchTimer = null;
function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 200);
}

async function handleDelete(id) {
  await deleteEntry(id);
  await load();
}

async function handleClearAll() {
  if (!entries.value.length) return;
  const confirmed = window.confirm("Удалить всю историю расчётов? Это действие необратимо.");
  if (!confirmed) return;
  await clearHistory();
  await load();
}

function reuseEntry(entry) {
  products.addRow({
    name: entry.name,
    purchasePrice: entry.purchase_price,
    weightOrVolume: entry.weight_or_volume,
    unit: entry.unit,
    vat: entry.vat,
    country: entry.country,
  });
  router.push("/");
}

const hasEntries = computed(() => entries.value.length > 0);

onMounted(load);
</script>

<template>
  <section class="view">
    <div class="header-row">
      <h1 class="page-title">История расчётов</h1>
      <div class="header-actions">
        <input
          v-model="query"
          type="text"
          placeholder="Поиск по названию..."
          class="search-input"
          @input="onSearchInput"
        />
        <button type="button" class="btn btn-ghost" :disabled="!hasEntries" @click="handleClearAll">
          Очистить всё
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <div class="table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Наименование</th>
            <th>Закуп.</th>
            <th>Наценка</th>
            <th>Розничная</th>
            <th>Цена за ед.</th>
            <th>Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id">
            <td class="tabular cell-date">{{ entry.created_at }}</td>
            <td>{{ entry.name }}</td>
            <td class="tabular cell-num">{{ entry.purchase_price }}</td>
            <td class="tabular cell-num">{{ entry.applied_markup }}%</td>
            <td class="tabular cell-num cell-strong">{{ entry.retail_price }}</td>
            <td class="tabular cell-num">{{ entry.price_per_unit }}</td>
            <td>
              <StatusChip :status="entry.regulation_status" :limited="entry.markup_limited === 1" />
            </td>
            <td class="cell-actions">
              <button type="button" class="link-btn" @click="reuseEntry(entry)">Повторить</button>
              <button type="button" class="link-btn link-danger" @click="handleDelete(entry.id)">Удалить</button>
            </td>
          </tr>
          <tr v-if="!isLoading && !hasEntries">
            <td colspan="8" class="empty-cell">
              {{ query ? "Ничего не найдено." : "История пуста — здесь появятся ваши расчёты." }}
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
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.page-title {
  font-size: 22px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.search-input {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  min-width: 220px;
  background: var(--color-surface);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-brand-tint);
}

.btn-ghost {
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  color: var(--color-ink-muted);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
}
.btn-ghost:hover:not(:disabled) {
  color: var(--color-danger);
  border-color: var(--color-danger-line);
}
.btn-ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
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
  vertical-align: middle;
}

.cell-date {
  color: var(--color-ink-muted);
  font-size: 11.5px;
  white-space: nowrap;
}

.cell-num {
  text-align: right;
}

.cell-strong {
  font-weight: 600;
}

.cell-actions {
  white-space: nowrap;
  text-align: right;
}

.link-btn {
  border: none;
  background: transparent;
  color: var(--color-brand-dark);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 6px;
}
.link-btn:hover {
  text-decoration: underline;
}
.link-danger {
  color: var(--color-danger);
}

.empty-cell {
  text-align: center;
  color: var(--color-ink-muted);
  padding: 32px 10px;
}
</style>
