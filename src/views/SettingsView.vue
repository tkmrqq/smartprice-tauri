<script setup>
import { onMounted, ref } from "vue";
import { useSettingsStore } from "../stores/settings.js";
import { openRegulatedItemsWindow } from "../lib/windows.js";
import { checkForUpdates, readAppVersion } from "../lib/appUpdater.js";

const settings = useSettingsStore();
const apiKeyInput = ref(settings.visionApiKey);
const showKey = ref(false);
const saveMessage = ref("");
const appVersion = ref("…");
const updateBusy = ref(false);
const updateProgress = ref(null);
const updateHint = ref("");

onMounted(async () => {
  appVersion.value = await readAppVersion();
});

async function handleCheckUpdates() {
  updateBusy.value = true;
  updateProgress.value = null;
  updateHint.value = "";
  try {
    const result = await checkForUpdates({
      onProgress: (percent) => {
        updateProgress.value = percent;
      },
    });
    if (result.status === "latest") updateHint.value = "Установлена последняя версия.";
    else if (result.status === "declined") updateHint.value = `Обновление ${result.version} отложено.`;
    else if (result.status === "dev") updateHint.value = "В режиме разработки обновления не проверяются.";
    else if (result.status === "unsupported") updateHint.value = "Доступно только в собранном приложении.";
    else if (result.status === "error") updateHint.value = result.error || "Ошибка проверки.";
  } finally {
    updateBusy.value = false;
    updateProgress.value = null;
  }
}

async function handleSaveKey() {
  await settings.setVisionApiKey(apiKeyInput.value);
  saveMessage.value = "Ключ сохранён.";
  setTimeout(() => (saveMessage.value = ""), 2000);
}

async function handleOpenRegulatedEditor() {
  await openRegulatedItemsWindow();
}
</script>

<template>
  <section class="view">
    <h1 class="page-title">Настройки</h1>

    <article class="card">
      <h2 class="card-title">Google Cloud Vision API</h2>
      <p class="card-hint">
        Нужен только для распознавания фото бумажных накладных. Расчёт по накладным ЭДИН
        и ручной ввод работают без ключа и без интернета.
      </p>
      <div class="key-row">
        <input
          v-model="apiKeyInput"
          :type="showKey ? 'text' : 'password'"
          placeholder="AIza..."
          class="key-input"
        />
        <button type="button" class="btn btn-ghost" @click="showKey = !showKey">
          {{ showKey ? "Скрыть" : "Показать" }}
        </button>
        <button type="button" class="btn btn-primary" @click="handleSaveKey">Сохранить</button>
      </div>
      <p v-if="saveMessage" class="save-message">{{ saveMessage }}</p>
      <p class="key-status">
        Статус:
        <strong>{{ settings.hasVisionKey ? "ключ задан" : "ключ не задан" }}</strong>
      </p>
    </article>

    <article class="card">
      <h2 class="card-title">Обновления приложения</h2>
      <p class="card-hint">
        При запуске release-сборки проверка выполняется автоматически. Здесь можно проверить вручную
        и установить новую версию с GitHub Releases.
      </p>
      <p class="key-status">
        Текущая версия:
        <strong>{{ appVersion }}</strong>
      </p>
      <button type="button" class="btn btn-primary" :disabled="updateBusy" @click="handleCheckUpdates">
        {{ updateBusy ? "Проверяем…" : "Проверить обновления" }}
      </button>
      <p v-if="updateProgress != null" class="save-message">Загрузка: {{ updateProgress }}%</p>
      <p v-if="updateHint" class="save-message">{{ updateHint }}</p>
    </article>

    <article class="card">
      <h2 class="card-title">Категории регулирования (Пост. №713)</h2>
      <p class="card-hint">
        Список ключевых слов и предельных наценок, по которому определяется, регулируется ли
        товар. Открывается в отдельном окне — удобно держать рядом с основной таблицей.
      </p>
      <p class="key-status">
        Источник:
        <strong>{{ settings.regulatedItemsSource === "custom" ? "пользовательский" : "по умолчанию" }}</strong>
      </p>
      <button type="button" class="btn btn-primary" @click="handleOpenRegulatedEditor">
        Открыть редактор категорий в отдельном окне
      </button>
    </article>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 640px;
  margin: 0 auto;
}

.page-title {
  font-size: 22px;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-title {
  font-size: 15px;
}

.card-hint {
  font-size: 12.5px;
  color: var(--color-ink-muted);
  line-height: 1.5;
  margin: 0;
}

.key-row {
  display: flex;
  gap: 8px;
}

.key-input {
  flex: 1;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 13px;
  background: var(--color-paper);
}
.key-input:focus {
  outline: none;
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-brand-tint);
  background: var(--color-surface);
}

.btn {
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.btn-ghost {
  color: var(--color-ink-muted);
}
.btn-primary {
  background: var(--color-brand);
  border-color: var(--color-brand);
  color: #fff;
}
.btn-primary:hover {
  background: var(--color-brand-dark);
}

.save-message {
  font-size: 12px;
  color: var(--color-brand-dark);
  margin: 0;
}

.key-status {
  font-size: 12.5px;
  color: var(--color-ink-muted);
  margin: 0;
}
</style>
