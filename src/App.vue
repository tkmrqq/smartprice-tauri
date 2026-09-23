<script setup>
import { onMounted, onUnmounted, ref, computed } from "vue";
import { useRoute } from "vue-router";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "./stores/settings.js";
import { initDb } from "./lib/db.js";
import { REGULATED_ITEMS_UPDATED_EVENT } from "./lib/windows.js";
import { checkForUpdates } from "./lib/appUpdater.js";

const settings = useSettingsStore();
const route = useRoute();
const initError = ref("");
let unlisten = null;

// Окно редактора категорий открывается как отдельное нативное окно поверх
// того же index.html — в нём не нужна навигация основного приложения.
const isStandaloneWindow = computed(() => route.name === "regulated-items");

onMounted(async () => {
  try {
    await settings.load();
    await initDb();
    // Если категории отредактировали в отдельном окне — подхватываем
    // изменения здесь же, без перезапуска приложения.
    unlisten = await listen(REGULATED_ITEMS_UPDATED_EVENT, () => {
      settings.load();
    });
    // В dev и в браузере проверка пропускается — см. appUpdater.js.
    void checkForUpdates({ silent: true });
  } catch (e) {
    initError.value = String(e?.message || e);
  }
});

onUnmounted(() => {
  if (unlisten) unlisten();
});
</script>

<template>
  <div class="shell">
    <header v-if="!isStandaloneWindow" class="topbar">
      <div class="brand">
        <span class="brand-mark">SmartPrice</span>
        <span class="brand-tag">РБ</span>
      </div>
      <nav class="nav">
        <router-link to="/" class="nav-tab">Расчёт цен</router-link>
        <router-link to="/price-compare" class="nav-tab">Сравнение прайсов</router-link>
        <router-link to="/history" class="nav-tab">История</router-link>
        <router-link to="/settings" class="nav-tab">Настройки</router-link>
      </nav>
    </header>

    <div v-if="initError" class="init-error">
      Не удалось инициализировать приложение: {{ initError }}
    </div>

    <main class="content" :class="{ 'content-standalone': isStandaloneWindow }">
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
</style>
