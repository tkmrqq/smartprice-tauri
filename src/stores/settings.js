import { defineStore } from "pinia";
import { Store } from "@tauri-apps/plugin-store";
import { setRegulatedCategories, getRegulatedCategories } from "../lib/calculator.js";
import defaultRegulatedItems from "../assets/regulated_items.json";
import { DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_UNP } from "../lib/priceLabels.js";
import { isBackupDue } from "../lib/backup.js";

const SETTINGS_FILE = "settings.json";
let _store = null;

async function getStore() {
  if (!_store) {
    _store = await Store.load(SETTINGS_FILE);
  }
  return _store;
}

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    visionApiKey: "",
    companyName: DEFAULT_COMPANY_NAME,
    companyUnp: DEFAULT_COMPANY_UNP,
    printBarcode: false,
    // Для напоминания о резервной копии (ISO-даты; хранятся в settings.json)
    lastBackupAt: "",
    firstRunAt: "",
    regulatedItemsSource: "default", // "default" | "custom"
    loaded: false,
  }),

  getters: {
    hasVisionKey: (state) => Boolean(state.visionApiKey?.trim()),
    backupDue: (state) => isBackupDue(state.lastBackupAt, state.firstRunAt),
    regulatedCategories: () => getRegulatedCategories(),
  },

  actions: {
    async load() {
      const store = await getStore();
      this.visionApiKey = (await store.get("visionApiKey")) || "";

      // Реквизиты ценника: пока пользователь ничего не сохранил, остаются
      // значения по умолчанию (те, что раньше были зашиты в код).
      const savedName = await store.get("companyName");
      const savedUnp = await store.get("companyUnp");
      const savedBarcode = await store.get("printBarcode");
      this.companyName = typeof savedName === "string" ? savedName : DEFAULT_COMPANY_NAME;
      this.companyUnp = typeof savedUnp === "string" ? savedUnp : DEFAULT_COMPANY_UNP;
      this.printBarcode = savedBarcode === true;

      // Дата первого запуска — точка отсчёта для напоминания о копии: в первую
      // неделю напоминать рано.
      this.lastBackupAt = (await store.get("lastBackupAt")) || "";
      this.firstRunAt = (await store.get("firstRunAt")) || "";
      if (!this.firstRunAt) {
        this.firstRunAt = new Date().toISOString();
        await store.set("firstRunAt", this.firstRunAt);
        await store.save();
      }

      const customCategories = await store.get("regulatedCategoriesJson");
      if (customCategories) {
        try {
          setRegulatedCategories(JSON.parse(customCategories));
          this.regulatedItemsSource = "custom";
        } catch {
          setRegulatedCategories(defaultRegulatedItems);
          this.regulatedItemsSource = "default";
        }
      } else {
        setRegulatedCategories(defaultRegulatedItems);
        this.regulatedItemsSource = "default";
      }

      this.loaded = true;
    },

    async setVisionApiKey(key) {
      this.visionApiKey = key.trim();
      const store = await getStore();
      await store.set("visionApiKey", this.visionApiKey);
      await store.save();
    },

    async markBackupDone() {
      this.lastBackupAt = new Date().toISOString();
      const store = await getStore();
      await store.set("lastBackupAt", this.lastBackupAt);
      await store.save();
    },

    /**
     * Настройки для резервной копии. Ключ Google Vision — секрет, поэтому
     * попадает в файл только по явному согласию.
     */
    async exportSnapshot({ includeVisionKey = false } = {}) {
      const store = await getStore();
      const snapshot = {
        companyName: this.companyName,
        companyUnp: this.companyUnp,
        printBarcode: this.printBarcode,
      };
      const customJson = await store.get("regulatedCategoriesJson");
      if (customJson) {
        try {
          snapshot.regulatedCategories = JSON.parse(customJson);
        } catch {
          /* повреждённые свои категории в копию не берём */
        }
      }
      if (includeVisionKey && this.visionApiKey) snapshot.visionApiKey = this.visionApiKey;
      return snapshot;
    },

    /** Применяет настройки из копии; чего в копии нет — не трогаем. */
    async importSnapshot(snapshot) {
      const store = await getStore();
      if (typeof snapshot.companyName === "string") await store.set("companyName", snapshot.companyName);
      if (typeof snapshot.companyUnp === "string") await store.set("companyUnp", snapshot.companyUnp);
      if (typeof snapshot.printBarcode === "boolean") await store.set("printBarcode", snapshot.printBarcode);
      if (snapshot.visionApiKey) await store.set("visionApiKey", snapshot.visionApiKey);
      if (snapshot.regulatedCategories) {
        await store.set("regulatedCategoriesJson", JSON.stringify(snapshot.regulatedCategories));
      }
      await store.save();
      await this.load();
    },

    async setLabelSettings({ companyName, companyUnp, printBarcode }) {
      this.companyName = String(companyName ?? "").trim();
      this.companyUnp = String(companyUnp ?? "").trim();
      this.printBarcode = Boolean(printBarcode);
      const store = await getStore();
      await store.set("companyName", this.companyName);
      await store.set("companyUnp", this.companyUnp);
      await store.set("printBarcode", this.printBarcode);
      await store.save();
    },

    /** Позволяет пользователю подгрузить собственный regulated_items.json без пересборки приложения. */
    async setCustomRegulatedItems(jsonData) {
      setRegulatedCategories(jsonData);
      const store = await getStore();
      await store.set("regulatedCategoriesJson", JSON.stringify(jsonData));
      await store.save();
      this.regulatedItemsSource = "custom";
    },

    async resetToDefaultRegulatedItems() {
      setRegulatedCategories(defaultRegulatedItems);
      const store = await getStore();
      await store.delete("regulatedCategoriesJson");
      await store.save();
      this.regulatedItemsSource = "default";
    },
  },
});
