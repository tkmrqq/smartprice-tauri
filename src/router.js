import { createRouter, createWebHashHistory } from "vue-router";
import CalculatorView from "./views/CalculatorView.vue";
import HistoryView from "./views/HistoryView.vue";
import SettingsView from "./views/SettingsView.vue";
import RegulatedItemsView from "./views/RegulatedItemsView.vue";

// Hash-история: приложение — статичный index.html без сервера, который умел
// бы отдавать произвольные пути (в т.ч. для дополнительных нативных окон
// Tauri, открывающих "index.html#/regulated-items"). WebHistory тут не
// сработает без серверных переписываний путей.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "calculator", component: CalculatorView },
    { path: "/history", name: "history", component: HistoryView },
    { path: "/settings", name: "settings", component: SettingsView },
    { path: "/regulated-items", name: "regulated-items", component: RegulatedItemsView },
  ],
});
