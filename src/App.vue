<script setup>
import { onMounted, ref, computed } from "vue";
import { useSettingsStore } from "./stores/settings.js";
import { initDb } from "./lib/db.js";
import { saveBackupToFile } from "./lib/backupFlow.js";

const settings = useSettingsStore();
const initError = ref("");

// Напоминание о резервной копии: раз в неделю, пока копию не сделают
const backupReminderDismissed = ref(false);
const backupSaving = ref(false);
const showBackupReminder = computed(
  () => settings.loaded && settings.backupDue && !backupReminderDismissed.value
);

async function saveBackupFromReminder() {
  backupSaving.value = true;
  try {
    await saveBackupToFile();
  } catch (e) {
    initError.value = `Не удалось сохранить копию: ${e.message || e}`;
  } finally {
    backupSaving.value = false;
  }
}

onMounted(async () => {
  try {
    await settings.load();
    await initDb();
    
  } catch (e) {
    initError.value = String(e?.message || e);
  }
});

</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">SmartPrice</span>
        <span class="brand-tag">РБ</span>
      </div>
      <nav class="nav">
        <router-link to="/" class="nav-tab">Расчёт цен</router-link>
        <router-link to="/price-compare" class="nav-tab">Сравнение прайсов</router-link>
        <router-link to="/catalog" class="nav-tab">Товары</router-link>
        <router-link to="/history" class="nav-tab">История</router-link>
        <router-link to="/settings" class="nav-tab">Настройки</router-link>
      </nav>
    </header>

    <div v-if="showBackupReminder" class="backup-reminder">
      <span>Давно не сохраняли резервную копию данных (история, справочник, настройки).</span>
      <span class="backup-reminder-actions">
        <button type="button" class="reminder-btn reminder-btn-primary" :disabled="backupSaving" @click="saveBackupFromReminder">
          Сохранить копию…
        </button>
        <button type="button" class="reminder-btn" @click="backupReminderDismissed = true">Позже</button>
      </span>
    </div>

    <div v-if="initError" class="init-error">
      Не удалось инициализировать приложение: {{ initError }}
    </div>

    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-line);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.brand-mark {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-ink);
}

.brand-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-brand);
  background: var(--color-brand-tint);
  border-radius: 999px;
  padding: 2px 8px;
}

.nav {
  display: flex;
  gap: 4px;
}

.nav-tab {
  position: relative;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink-muted);
  text-decoration: none;
  transition: color 0.12s ease, background 0.12s ease;
}

.nav-tab:hover {
  color: var(--color-ink);
  background: var(--color-paper);
}

.nav-tab.router-link-exact-active {
  color: var(--color-brand-dark);
  background: var(--color-brand-tint);
}

/* Сигнатурная деталь: активная вкладка помечена, как оторванный корешок
   ценника — маленький "пробитый" кружок слева, будто бирка на нитке. */
.nav-tab.router-link-exact-active::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--color-brand);
  transform: translateY(-50%);
}

.nav-tab.router-link-exact-active {
  padding-left: 18px;
}

.backup-reminder {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--color-warning-tint);
  border-bottom: 1px solid var(--color-warning-line);
  color: var(--color-warning);
  padding: 8px 24px;
  font-size: 13px;
}
.backup-reminder-actions {
  display: flex;
  gap: 8px;
}
.reminder-btn {
  border: 1px solid var(--color-warning-line);
  background: var(--color-surface);
  color: var(--color-ink);
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}
.reminder-btn-primary {
  background: var(--color-brand);
  border-color: var(--color-brand);
  color: #fff;
}
.reminder-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.init-error {
  background: var(--color-danger-tint);
  border-bottom: 1px solid var(--color-danger-line);
  color: var(--color-danger);
  padding: 10px 24px;
  font-size: 13px;
}

.content {
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.content:has(.editor-mode) {
  padding-top: 0;
}

</style>
