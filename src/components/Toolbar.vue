<script setup>
defineProps({
  busy: { type: Boolean, default: false },
});

defineEmits([
  "add-row",
  "import-edin",
  "import-photo",
  "calculate",
  "generate-labels",
]);
</script>

<template>
  <div class="toolbar">
    <button type="button" class="btn" :disabled="busy" @click="$emit('add-row')">
      + Строка
    </button>
    <div class="divider" />
    <button type="button" class="btn" :disabled="busy" @click="$emit('import-edin')">
      Накладная ЭДИН (XML)
    </button>
    <button type="button" class="btn" :disabled="busy" @click="$emit('import-photo')">
      Фото накладной
    </button>
    <div class="divider" />
    <button type="button" class="btn btn-primary" :disabled="busy" @click="$emit('calculate')">
      Рассчитать цены
    </button>
    <button type="button" class="btn" :disabled="busy" @click="$emit('generate-labels')">
      Сформировать ценники
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.divider {
  width: 1px;
  height: 22px;
  background: var(--color-line);
  margin: 0 2px;
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
  transition: border-color 0.12s ease, background 0.12s ease;
}

.btn:hover:not(:disabled) {
  border-color: var(--color-line-strong);
  background: var(--color-paper);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--color-brand);
  border-color: var(--color-brand);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-brand-dark);
  border-color: var(--color-brand-dark);
}
</style>
