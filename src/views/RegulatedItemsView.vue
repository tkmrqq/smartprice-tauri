<script setup>
import { ref, onMounted } from "vue";
import { emit } from "@tauri-apps/api/event";
import { useSettingsStore } from "../stores/settings.js";
import { REGULATED_ITEMS_UPDATED_EVENT } from "../lib/windows.js";
import defaultRegulatedItems from "../assets/regulated_items.json";

const settings = useSettingsStore();
const categories = ref([]);
const saveState = ref(""); // "" | "saving" | "saved" | "error"
const saveErrorText = ref("");

function toEditable(cat, index) {
  return {
    _key: cat.id || `cat-${index}`,
    id: cat.id || `custom-${Date.now()}-${index}`,
    category_name: cat.category_name || "",
    keywordsText: (cat.keywords || []).join(", "),
    excludeKeywordsText: (cat.exclude_keywords || []).join(", "),
    max_markup: cat.max_markup ?? "",
    max_markup_imported: cat.max_markup_imported ?? "",
    note: cat.note || "",
    imported_note: cat.imported_note || "",
  };
}

async function loadCurrent() {
  await settings.load();
  const source = settings.regulatedCategories?.length
    ? settings.regulatedCategories
    : defaultRegulatedItems.categories;
  categories.value = source.map(toEditable);
}

function addCategory() {
  categories.value.push(
    toEditable(
      { id: `custom-${Date.now()}`, category_name: "", keywords: [] },
      categories.value.length
    )
  );
}

function removeCategory(key) {
  categories.value = categories.value.filter((c) => c._key !== key);
}

function splitList(text) {
  return text
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseMarkup(value) {
  if (value === "" || value == null) return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}

async function handleSave() {
  saveState.value = "saving";
  saveErrorText.value = "";
  try {
    const payload = {
      categories: categories.value
        .filter((c) => c.category_name.trim() && splitList(c.keywordsText).length)
        .map((c) => ({
          id: c.id,
          category_name: c.category_name.trim(),
          keywords: splitList(c.keywordsText),
          exclude_keywords: splitList(c.excludeKeywordsText),
          max_markup: parseMarkup(c.max_markup),
          max_markup_imported: parseMarkup(c.max_markup_imported),
          note: c.note.trim() || undefined,
          imported_note: c.imported_note.trim() || undefined,
        })),
    };
    await settings.setCustomRegulatedItems(payload);
    await emit(REGULATED_ITEMS_UPDATED_EVENT, {});
    saveState.value = "saved";
    setTimeout(() => {
      if (saveState.value === "saved") saveState.value = "";
    }, 2500);
  } catch (e) {
    saveState.value = "error";
    saveErrorText.value = String(e?.message || e);
  }
}

async function handleResetDefaults() {
  const confirmed = window.confirm(
    "Сбросить список категорий к значениям по умолчанию? Все ваши правки будут потеряны."
  );
  if (!confirmed) return;
  await settings.resetToDefaultRegulatedItems();
  await emit(REGULATED_ITEMS_UPDATED_EVENT, {});
  categories.value = defaultRegulatedItems.categories.map(toEditable);
}

onMounted(loadCurrent);
</script>

<template>
  <section class="view">
    <div class="header-row">
      <div>
        <h1 class="page-title">Категории регулирования цен</h1>
        <p class="page-subtitle">
          Постановление Совета Министров РБ №713. Товар относится к категории, если его
          название содержит одно из ключевых слов и не содержит ни одного слова-исключения.
        </p>
      </div>
      <span class="source-badge" :class="settings.regulatedItemsSource">
        {{ settings.regulatedItemsSource === "custom" ? "Пользовательский список" : "Список по умолчанию" }}
      </span>
    </div>

    <div class="toolbar">
      <button type="button" class="btn" @click="addCategory">+ Добавить категорию</button>
      <button type="button" class="btn btn-ghost" @click="handleResetDefaults">Сбросить к умолчаниям</button>
      <div class="spacer" />
      <span v-if="saveState === 'saved'" class="save-status save-ok">Сохранено ✓</span>
      <span v-if="saveState === 'error'" class="save-status save-error">Ошибка: {{ saveErrorText }}</span>
      <button type="button" class="btn btn-primary" :disabled="saveState === 'saving'" @click="handleSave">
        {{ saveState === "saving" ? "Сохранение..." : "Сохранить изменения" }}
      </button>
    </div>

    <div class="cards">
      <article v-for="cat in categories" :key="cat._key" class="card">
        <button type="button" class="card-remove" title="Удалить категорию" @click="removeCategory(cat._key)">
          ✕
        </button>

        <label class="field field-title">
          <span class="field-label">Название категории</span>
          <input v-model="cat.category_name" type="text" placeholder="напр. Хлеб и хлебобулочные изделия" />
        </label>

        <div class="field-grid">
          <label class="field">
            <span class="field-label">Ключевые слова (через запятую)</span>
            <textarea v-model="cat.keywordsText" rows="2" placeholder="хлеб, батон, булк"></textarea>
          </label>
          <label class="field">
            <span class="field-label">Слова-исключения (через запятую)</span>
            <textarea v-model="cat.excludeKeywordsText" rows="2" placeholder="хлебница, хлебопечка"></textarea>
          </label>
        </div>

        <div class="field-grid field-grid-narrow">
          <label class="field">
            <span class="field-label">Макс. наценка, %</span>
            <input v-model="cat.max_markup" type="text" class="tabular" placeholder="напр. 10" />
          </label>
          <label class="field">
            <span class="field-label">Макс. наценка (импорт), %</span>
            <input v-model="cat.max_markup_imported" type="text" class="tabular" placeholder="если отличается" />
          </label>
        </div>

        <label class="field">
          <span class="field-label">Примечание</span>
          <input v-model="cat.note" type="text" placeholder="произвольный комментарий (необязательно)" />
        </label>
      </article>

      <p v-if="!categories.length" class="empty-hint">
        Список пуст. Нажмите «Добавить категорию», чтобы начать.
      </p>
    </div>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 920px;
  margin: 0 auto;
  padding-bottom: 32px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-title {
  font-size: 20px;
}

.page-subtitle {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--color-ink-muted);
  max-width: 60ch;
  line-height: 1.5;
}

.source-badge {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}
.source-badge.default {
  background: var(--color-brand-tint);
  color: var(--color-brand-dark);
}
.source-badge.custom {
  background: var(--color-warning-tint);
  color: var(--color-warning);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  position: sticky;
  top: 0;
  background: var(--color-paper);
  padding: 8px 0;
  z-index: 2;
}

.spacer {
  flex: 1;
}

.save-status {
  font-size: 12px;
  margin-right: 4px;
}
.save-ok {
  color: var(--color-brand-dark);
}
.save-error {
  color: var(--color-danger);
}

.btn {
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  color: var(--color-ink);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  background: var(--color-paper);
  border-color: var(--color-line-strong);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-ghost {
  color: var(--color-ink-muted);
}
.btn-primary {
  background: var(--color-brand);
  border-color: var(--color-brand);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  background: var(--color-brand-dark);
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  position: relative;
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-remove {
  position: absolute;
  top: 10px;
  right: 10px;
  border: none;
  background: transparent;
  color: var(--color-line-strong);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
}
.card-remove:hover {
  color: var(--color-danger);
  background: var(--color-danger-tint);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-title input {
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font-display);
}

.field-label {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-ink-muted);
}

.field input,
.field textarea {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-ink);
  background: var(--color-paper);
  resize: vertical;
}

.field input:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-brand-tint);
  background: var(--color-surface);
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field-grid-narrow input {
  max-width: 220px;
}

.empty-hint {
  text-align: center;
  color: var(--color-ink-muted);
  padding: 32px 0;
}

@media (max-width: 640px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
