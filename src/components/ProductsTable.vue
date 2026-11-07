<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useProductsStore } from "../stores/products.js";
import StatusChip from "./StatusChip.vue";
import { purchaseDelta, formatPercent } from "../lib/catalog.js";

const products = useProductsStore();

// Изменение закупки относительно прошлого расчёта этого товара (из справочника)
function delta(row) {
  return purchaseDelta(row.prevPurchasePrice, row.purchasePrice);
}

function rowClass(row) {
  if (row.calcError) return "row-error";
  if (row.markupLimited || row.markupPercentUnknown) return "row-warning";
  if (row.regulationStatus === "Регулируется") return "row-regulated";
  return "";
}

// ---------------------------------------------------------------------
// Ширина колонок. По умолчанию колонки делят всю ширину окна по долям
// (frac) и пересчитываются при изменении размера окна. Как только
// пользователь потянул за границу заголовка — ширины фиксируются в px,
// запоминаются между запусками, а лишнее место справа остаётся пустым
// (или появляется горизонтальная прокрутка, если колонки шире окна).
// ---------------------------------------------------------------------
const COLS = [
  { key: "name", label: "Наименование товара", frac: 0.2, min: 140 },
  { key: "barcode", label: "Штрихкод", frac: 0.09, min: 112 },
  { key: "purchasePrice", label: "Закуп., BYN", frac: 0.07, min: 72 },
  { key: "weight", label: "Вес/объём", frac: 0.06, min: 66 },
  { key: "unit", label: "Ед.", frac: 0.05, min: 56 },
  { key: "supplierMarkup", label: "Нац. пост., %", frac: 0.065, min: 78 },
  { key: "markup", label: "Торг. наценка, %", frac: 0.065, min: 78 },
  { key: "vat", label: "НДС, %", frac: 0.05, min: 58 },
  { key: "sortGrade", label: "Сорт/вид", frac: 0.08, min: 80 },
  { key: "country", label: "Страна", frac: 0.08, min: 80 },
  { key: "retailPrice", label: "Розничная, BYN", frac: 0.08, min: 90 },
  { key: "pricePerUnit", label: "Цена за ед.", frac: 0.075, min: 80 },
  { key: "status", label: "Статус Пост. 713", frac: 0.15, min: 190 },
];
const ACTION_WIDTH = 36;
const MIN_DRAG_WIDTH = 44;
const MAX_DRAG_WIDTH = 900;
const STORAGE_KEY = "smartprice.columnWidths.v1";

const wrapRef = ref(null);
const widths = ref(COLS.map((c) => c.min));
const customized = ref(false);
let resizeObserver = null;

const tableMinWidth = computed(() => widths.value.reduce((a, b) => a + b, 0) + ACTION_WIDTH);

function computeFitWidths() {
  const container = wrapRef.value?.clientWidth || 1200;
  const available = container - ACTION_WIDTH - 2;
  const fracSum = COLS.reduce((s, c) => s + c.frac, 0);
  return COLS.map((c) => Math.max(c.min, Math.floor((available * c.frac) / fracSum)));
}

function saveWidths() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ widths: widths.value }));
  } catch {
    /* хранилище недоступно — не критично */
  }
}

function loadSavedWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const list = saved?.widths;
    if (
      Array.isArray(list) &&
      list.length === COLS.length &&
      list.every((w) => Number.isFinite(w) && w >= MIN_DRAG_WIDTH)
    ) {
      return list;
    }
  } catch {
    /* повреждённые данные — игнорируем */
  }
  return null;
}

function resetWidths() {
  customized.value = false;
  widths.value = computeFitWidths();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function resetColumn(index) {
  const next = [...widths.value];
  next[index] = computeFitWidths()[index];
  widths.value = next;
  customized.value = true;
  saveWidths();
}

function startResize(index, event) {
  const startX = event.clientX;
  const startWidth = widths.value[index];

  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";

  function onMove(e) {
    const next = Math.min(MAX_DRAG_WIDTH, Math.max(MIN_DRAG_WIDTH, Math.round(startWidth + e.clientX - startX)));
    if (next === widths.value[index]) return;
    customized.value = true;
    const copy = [...widths.value];
    copy[index] = next;
    widths.value = copy;
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (customized.value) saveWidths();
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

onMounted(() => {
  const saved = loadSavedWidths();
  if (saved) {
    widths.value = saved;
    customized.value = true;
  } else {
    widths.value = computeFitWidths();
  }

  if (typeof ResizeObserver !== "undefined" && wrapRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (!customized.value) widths.value = computeFitWidths();
    });
    resizeObserver.observe(wrapRef.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="table-block">
    <div class="table-tools">
      <span class="tools-hint">Ширину колонок можно менять, потянув за границу в заголовке</span>
      <button v-if="customized" type="button" class="tools-btn" @click="resetWidths">
        Сбросить ширину колонок
      </button>
    </div>

    <div ref="wrapRef" class="table-wrap">
      <table class="products-table" :style="{ minWidth: tableMinWidth + 'px' }">
        <colgroup>
          <col v-for="(w, i) in widths" :key="COLS[i].key" :style="{ width: w + 'px' }" />
          <col :style="{ width: ACTION_WIDTH + 'px' }" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th v-for="(c, i) in COLS" :key="c.key">
              <span class="th-label">{{ c.label }}</span>
              <span
                class="resizer"
                role="separator"
                aria-orientation="vertical"
                title="Потяните, чтобы изменить ширину (двойной клик — вернуть по умолчанию)"
                @pointerdown.prevent="startResize(i, $event)"
                @dblclick="resetColumn(i)"
              />
            </th>
            <th class="col-action" aria-label="Действия" />
            <th class="col-filler" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in products.rows" :key="row.id" :class="rowClass(row)">
            <td>
              <input
                v-model="row.name"
                type="text"
                placeholder="Название товара"
                class="cell-input cell-name"
              />
            </td>
            <td>
              <input v-model="row.barcode" type="text" inputmode="numeric" class="cell-input tabular" placeholder="штрихкод" />
            </td>
            <td>
              <input v-model="row.purchasePrice" type="text" class="cell-input tabular cell-num" placeholder="0,00" />
              <div
                v-if="delta(row)"
                class="price-delta"
                :class="delta(row).direction"
                :title="'Прошлая закупка: ' + row.prevPurchasePrice"
              >
                {{ delta(row).direction === "up" ? "▲" : "▼" }} {{ formatPercent(delta(row).pct) }}%
              </div>
            </td>
            <td>
              <input v-model="row.weight" type="text" class="cell-input tabular cell-num" />
            </td>
            <td>
              <select v-model="row.unit" class="cell-input cell-select">
                <option value="шт">шт</option>
                <option value="кг">кг</option>
                <option value="л">л</option>
              </select>
            </td>
            <td>
              <input v-model="row.supplierMarkup" type="text" class="cell-input tabular cell-num" />
            </td>
            <td>
              <input v-model="row.markup" type="text" class="cell-input tabular cell-num" />
            </td>
            <td>
              <input v-model="row.vat" type="text" class="cell-input tabular cell-num" />
            </td>
            <td>
              <input v-model="row.sortGrade" type="text" class="cell-input" />
            </td>
            <td>
              <input v-model="row.country" type="text" class="cell-input" />
            </td>
            <td class="tabular cell-readonly cell-num">{{ row.retailPrice || "—" }}</td>
            <td class="tabular cell-readonly cell-num">{{ row.pricePerUnit || "—" }}</td>
            <td class="cell-readonly cell-status">
              <StatusChip
                :status="row.calcError ? 'Ошибка расчёта' : row.regulationStatus"
                :limited="row.markupLimited"
                :unknown="row.markupPercentUnknown"
              />
              <div v-if="row.calcError" class="row-error-text">{{ row.calcError }}</div>
            </td>
            <td class="cell-action">
              <button
                type="button"
                class="icon-btn"
                title="Удалить строку"
                @click="products.removeRow(row.id)"
              >
                ✕
              </button>
            </td>
            <td class="cell-filler" />
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.table-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.table-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-height: 22px;
}

.tools-hint {
  font-size: 11.5px;
  color: var(--color-ink-muted);
}

.tools-btn {
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  color: var(--color-ink-muted);
  font-size: 11.5px;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.tools-btn:hover {
  color: var(--color-ink);
  border-color: var(--color-line-strong);
}

.table-wrap {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  overflow: auto;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.products-table {
  width: 100%;
  table-layout: fixed;
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
  white-space: nowrap;
  z-index: 1;
}

.th-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 6px;
}

/* Ползунок изменения ширины: узкая зона на правой границе заголовка */
.resizer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 9px;
  cursor: col-resize;
  touch-action: none;
}
.resizer::after {
  content: "";
  position: absolute;
  top: 25%;
  bottom: 25%;
  right: 3px;
  width: 1px;
  background: var(--color-line-strong);
  transition: background 0.1s ease, top 0.1s ease, bottom 0.1s ease, width 0.1s ease;
}
.resizer:hover::after {
  top: 15%;
  bottom: 15%;
  width: 3px;
  right: 2px;
  background: var(--color-brand);
}

tbody td {
  border-bottom: 1px solid var(--color-line);
  padding: 4px 6px;
  vertical-align: middle;
}

tbody tr:last-child td {
  border-bottom: none;
}

tbody tr.row-regulated {
  background: color-mix(in srgb, var(--color-danger-tint) 55%, transparent);
}
tbody tr.row-warning {
  background: color-mix(in srgb, var(--color-warning-tint) 65%, transparent);
}
tbody tr.row-error {
  background: color-mix(in srgb, var(--color-danger-tint) 80%, transparent);
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

.cell-select {
  width: 100%;
}

.cell-readonly {
  padding: 6px 10px;
  color: var(--color-ink);
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-num.cell-readonly {
  font-weight: 600;
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

/* Рост закупки — красным (товар подорожал), падение — зелёным */
.price-delta {
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.2;
  text-align: right;
  padding-right: 7px;
  margin-top: -1px;
  white-space: nowrap;
}
.price-delta.up {
  color: var(--color-danger);
}
.price-delta.down {
  color: var(--color-brand-dark);
}

.row-error-text {
  font-size: 11px;
  color: var(--color-danger);
  margin-top: 2px;
}
</style>
