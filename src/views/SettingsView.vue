<script setup>
import { ref, watch, computed } from "vue";
import { useSettingsStore } from "../stores/settings.js";
import { saveBackupToFile, readBackupFromFile, applyBackup } from "../lib/backupFlow.js";
import { describeBackup, BackupError } from "../lib/backup.js";
import RegulatedItemsEditor from "./RegulatedItemsView.vue";

const settings = useSettingsStore();
const apiKeyInput = ref(settings.visionApiKey);
const showKey = ref(false);
const saveMessage = ref("");
const showRegulatedEditor = ref(false);

async function handleSaveKey() {
  await settings.setVisionApiKey(apiKeyInput.value);
  saveMessage.value = "Ключ сохранён.";
  setTimeout(() => (saveMessage.value = ""), 2000);
}

// Реквизиты и параметры печати ценников
const companyName = ref(settings.companyName);
const companyUnp = ref(settings.companyUnp);
const printBarcode = ref(settings.printBarcode);
const labelsSaveMessage = ref("");

// Настройки подгружаются из хранилища асинхронно (App.vue) — подхватываем
// значения, как только они появились, если форма ещё не открыта вручную.
watch(
  () => settings.loaded,
  (loaded) => {
    if (!loaded) return;
    companyName.value = settings.companyName;
    companyUnp.value = settings.companyUnp;
    printBarcode.value = settings.printBarcode;
  }
);

async function handleSaveLabels() {
  await settings.setLabelSettings({
    companyName: companyName.value,
    companyUnp: companyUnp.value,
    printBarcode: printBarcode.value,
  });
  labelsSaveMessage.value = "Настройки ценников сохранены.";
  setTimeout(() => (labelsSaveMessage.value = ""), 2000);
}

// ---- Резервная копия ------------------------------------------------
const includeVisionKey = ref(false);
const backupBusy = ref(false);
const backupMessage = ref("");
const backupError = ref("");

const lastBackupText = computed(() => {
  if (!settings.lastBackupAt) return "ещё не делали";
  const date = new Date(settings.lastBackupAt);
  return Number.isNaN(date.getTime()) ? "ещё не делали" : date.toLocaleString("ru-RU");
});

async function handleSaveBackup() {
  backupMessage.value = "";
  backupError.value = "";
  backupBusy.value = true;
  try {
    const result = await saveBackupToFile({ includeVisionKey: includeVisionKey.value });
    if (!result.cancelled) {
      backupMessage.value =
        `Копия сохранена: ${result.path}. В ней записей истории: ${result.historyCount}, ` +
        `товаров в справочнике: ${result.catalogCount}.`;
    }
  } catch (e) {
    backupError.value = `Не удалось сохранить копию: ${e.message || e}`;
  } finally {
    backupBusy.value = false;
  }
}

async function handleRestoreBackup() {
  backupMessage.value = "";
  backupError.value = "";
  backupBusy.value = true;
  try {
    const picked = await readBackupFromFile();
    if (picked.cancelled) return;

    const confirmed = window.confirm(
      `${describeBackup(picked.backup)}\n\n` +
        "Данные из копии будут добавлены к текущим: одинаковые записи истории не дублируются, " +
        "товары справочника обновятся более свежими данными из копии. Ничего не удаляется.\n\nПродолжить?"
    );
    if (!confirmed) return;

    const counts = await applyBackup(picked.backup);
    backupMessage.value =
      `Восстановлено. Добавлено записей истории: ${counts.historyAdded} ` +
      `(уже были: ${counts.historySkipped}), обновлено товаров справочника: ${counts.catalogUpdated}.`;
  } catch (e) {
    backupError.value =
      e instanceof BackupError ? e.message : `Не удалось восстановить данные: ${e.message || e}`;
  } finally {
    backupBusy.value = false;
  }
}

async function handleOpenRegulatedEditor() {
  showRegulatedEditor.value = true;
}
</script>

<template>
  <section v-show="!showRegulatedEditor" class="view">
    <h1 class="page-title">Настройки</h1>

    <article class="card">
      <div class="card-heading">
        <h2 class="card-title">Google Cloud Vision API</h2>
        <span class="hint-icon"
          title="Нужен только для распознавания фото бумажных накладных. Расчёт по накладным ЭДИН и ручной ввод работают без ключа и без интернета."
          aria-label="Подсказка о Google Cloud Vision API">
          ?
        </span>
      </div>

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
      <div class="card-heading">
        <h2 class="card-title">Ценники</h2>
        <span class="hint-icon"
          title="Эти реквизиты печатаются в шапке каждого ценника. Штрихкод берётся из колонки «Штрихкод» таблицы расчёта; рисуются только корректные EAN-13/EAN-8/UPC-A (с верной контрольной цифрой) — иначе код не отсканируется."
          aria-label="Подсказка о реквизитах для печати ценников">
          ?
        </span>
      </div>

      <label class="field">
        <span class="field-label">Название организации</span>
        <input v-model="companyName" type="text" class="text-input" placeholder='ООО "Название"' />
      </label>
      <label class="field">
        <span class="field-label">УНП</span>
        <input v-model="companyUnp" type="text" inputmode="numeric" class="text-input tabular" placeholder="9 цифр" />
      </label>
      <label class="check-row">
        <input v-model="printBarcode" type="checkbox" class="check" />
        <span>Печатать штрихкод на ценниках</span>
      </label>
      <div class="actions">
        <button type="button" class="btn btn-primary" @click="handleSaveLabels">Сохранить</button>
        <span v-if="labelsSaveMessage" class="save-message">{{ labelsSaveMessage }}</span>
      </div>
    </article>

    <article class="card">
      <div class="card-heading">
        <h2 class="card-title">Резервная копия данных</h2>
        <span class="hint-icon"
          title="История расчётов, справочник товаров и настройки сохраняются в один файл. Храните копию не только на этом компьютере — на флешке или в облаке: если диск выйдет из строя или Windows переустановят, данные из приложения пропадут вместе с ним."
          aria-label="Подсказка о резервной копии данных">
          ?
        </span>
      </div>
      <label class="check-row">
        <input v-model="includeVisionKey" type="checkbox" class="check" />
        <span>Добавить в копию ключ Google Vision API (в файле он хранится открытым текстом)</span>
      </label>
      <div class="actions">
        <button type="button" class="btn btn-primary" :disabled="backupBusy" @click="handleSaveBackup">
          Сохранить копию…
        </button>
        <button type="button" class="btn" :disabled="backupBusy" @click="handleRestoreBackup">
          Восстановить из копии…
        </button>
      </div>
      <p class="key-status">Последняя копия: <strong>{{ lastBackupText }}</strong></p>
      <p v-if="backupMessage" class="save-message">{{ backupMessage }}</p>
      <p v-if="backupError" class="backup-error">{{ backupError }}</p>
    </article>

    <article class="card">
      <div class="card-heading">
        <h2 class="card-title">Категории регулирования (Пост. №713)</h2>
        <span class="hint-icon"
          title="Если вы хотите изменить список ключевых слов и предельных наценок, по которому определяется, регулируется ли товар, откройте редактор категорий регулирования. После внесения изменений в редакторе, они будут применены в приложении."
          aria-label="Подсказка о категориях регулирования">
          ?
        </span>
      </div>
      <p class="key-status">
        Источник:
        <strong>{{ settings.regulatedItemsSource === "custom" ? "пользовательский" : "по умолчанию" }}</strong>
      </p>
      <button type="button" class="btn btn-primary" @click="handleOpenRegulatedEditor">
        Открыть редактор категорий
      </button>
    </article>
  </section>

  <section v-if="showRegulatedEditor" class="editor-mode">
    <button type="button" class="btn btn-ghost btn-block" @click="showRegulatedEditor = false">
      ← Вернуться к настройкам
    </button>

    <RegulatedItemsEditor/>
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

.card-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hint-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 17px;
  height: 17px;
  border: 1px solid var(--color-ink-muted);
  border-radius: 50%;

  font-size: 11px;
  font-weight: 600;
  color: var(--color-ink-muted);

  cursor: help;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.hint-icon:hover {
  opacity: 1;
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
.btn-block {
  margin-top: 24px;
}


.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-ink-muted);
}

.text-input {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 13px;
  background: var(--color-paper);
}
.text-input:focus {
  outline: none;
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-brand-tint);
  background: var(--color-surface);
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.check {
  width: 15px;
  height: 15px;
  accent-color: var(--color-brand);
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.backup-error {
  font-size: 12.5px;
  color: var(--color-danger);
  background: var(--color-danger-tint);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  margin: 0;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
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
