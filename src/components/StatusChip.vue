<script setup>
const props = defineProps({
  status: { type: String, default: "" }, // regulationStatus text
  limited: { type: Boolean, default: false },
  unknown: { type: Boolean, default: false },
});

function variant() {
  if (!props.status) return "neutral";
  if (props.limited || props.unknown) return "warning";
  if (props.status === "Регулируется") return "regulated";
  return "neutral";
}
</script>

<template>
  <span v-if="status" class="chip" :class="variant()">
    <span class="chip-hole" />
    {{ status }}
  </span>
  <span v-else class="chip chip-empty">—</span>
</template>

<style scoped>
/* Сигнатурный элемент: статус расчёта показан как маленькая бирка-ценник —
   с "пробитым" отверстием слева, будто она подвешена на нитке к товару. */
.chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 16px;
  border-radius: 3px;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  border: 1px solid transparent;
}

.chip-hole {
  position: absolute;
  left: 6px;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 1px solid currentColor;
  transform: translateY(-50%);
}

.chip.neutral {
  background: var(--color-paper);
  border-color: var(--color-line);
  color: var(--color-ink-muted);
}

.chip.regulated {
  background: var(--color-danger-tint);
  border-color: var(--color-danger-line);
  color: var(--color-danger);
}

.chip.warning {
  background: var(--color-warning-tint);
  border-color: var(--color-warning-line);
  color: var(--color-warning);
}

.chip-empty {
  color: var(--color-line-strong);
  padding-left: 10px;
}
</style>
