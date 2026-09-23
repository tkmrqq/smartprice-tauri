import { defineStore } from "pinia";
import { Store } from "@tauri-apps/plugin-store";
import { setRegulatedCategories, getRegulatedCategories } from "../lib/calculator.js";
import defaultRegulatedItems from "../assets/regulated_items.json";

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
    regulatedItemsSource: "default", // "default" | "custom"
    loaded: false,
  }),

  getters: {
    hasVisionKey: (state) => Boolean(state.visionApiKey?.trim()),
    regulatedCategories: () => getRegulatedCategories(),
  },

  actions: {
    async load() {
      const store = await getStore();
      this.visionApiKey = (await store.get("visionApiKey")) || "";

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
