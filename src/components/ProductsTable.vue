<script setup>
import { useProductsStore } from "../stores/products.js";
import StatusChip from "./StatusChip.vue";

const products = useProductsStore();

function rowClass(row) {
  if (row.calcError) return "row-error";
  if (row.markupLimited || row.markupPercentUnknown) return "row-warning";
  if (row.regulationStatus === "Регулируется") return "row-regulated";
  return "";
}
</script>

<template>
  <div class="table-wrap">
    <table class="products-table">
      <colgroup>
        <col style="width: 22%" />
        <col style="width: 8%" />
        <col style="width: 7%" />
        <col style="width: 5%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
        <col style="width: 6%" />
        <col style="width: 9%" />
        <col style="width: 9%" />
        <col style="width: 8%" />
        <col style="width: 8%" />
        <col style="width: auto" />
        <col style="width: 32px" />
      </colgroup>
      <thead>
        <tr>
          <th class="col-name">Наименование товара</th>
          <th class="col-num">Закуп., BYN</th>
          <th class="col-num">Вес/объём</th>
          <th class="col-unit">Ед.</th>
          <th class="col-num">Нац. пост., %</th>
          <th class="col-num">Торг. наценка, %</th>
          <th class="col-num">НДС, %</th>
          <th class="col-text">Сорт/вид</th>
          <th class="col-text">Страна</th>
          <th class="col-num">Розничная, BYN</th>
          <th class="col-num">Цена за ед.</th>
          <th class="col-status">Статус Пост. 713</th>
          <th class="col-action" aria-label="Действия" />
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
            <input v-model="row.purchasePrice" type="text" class="cell-input tabular cell-num" placeholder="0,00" />
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
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrap {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  overflow: auto;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.products-table {
  /* width: 100%; */
  min-width: 1040px;
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
}

.cell-num.cell-readonly {
  font-weight: 600;
}

.col-status {
  min-width: 220px;
}

.cell-action {
  width: 32px;
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

.row-error-text {
  font-size: 11px;
  color: var(--color-danger);
  margin-top: 2px;
}
</style>
