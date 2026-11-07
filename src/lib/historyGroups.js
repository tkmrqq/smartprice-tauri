/**
 * lib/historyGroups.js
 * Группировка записей истории по календарным дням (в местном времени).
 *
 * created_at хранится в UTC без суффикса Z ("2026-11-05T14:23:11"), поэтому
 * перед группировкой переводим в местное время: иначе записи, сделанные
 * после полуночи по Минску, попали бы в «вчера».
 */

// Форматируем на месте (toLocale*), а не кэшируем Intl-объекты на уровне
// модуля: так всегда используется актуальный часовой пояс системы.
const DATE_OPTIONS = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
const TIME_OPTIONS = { hour: "2-digit", minute: "2-digit" };

export function parseCreatedAt(value) {
    const date = new Date(`${String(value).replace(" ", "T")}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function localDateKey(date) {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${mm}-${dd}`;
}

export function dateLabel(date, now = new Date()) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const key = localDateKey(date);
    const base = date.toLocaleDateString("ru-RU", DATE_OPTIONS);
    if (key === localDateKey(now)) return `Сегодня · ${base}`;
    if (key === localDateKey(yesterday)) return `Вчера · ${base}`;
    return base;
}

export function formatTime(value) {
    const date = parseCreatedAt(value);
    return date ? date.toLocaleTimeString("ru-RU", TIME_OPTIONS) : String(value);
}

/**
 * Плоский список для таблицы: строка-разделитель с датой, затем записи этого
 * дня. Порядок записей сохраняется (история приходит от новых к старым).
 * @param {{id:number, created_at:string}[]} entries
 */
export function groupEntriesByDay(entries, now = new Date()) {
    const rows = [];
    let current = null;
    entries.forEach((entry, index) => {
        const date = parseCreatedAt(entry.created_at);
        const key = date ? localDateKey(date) : "unknown";
        if (!current || current.dayKey !== key) {
            current = {
                type: "date",
                key: `date:${key}`,
                dayKey: key,
                label: date ? dateLabel(date, now) : "Дата неизвестна",
                ids: [],
            };
            rows.push(current);
        }
        current.ids.push(entry.id);
        rows.push({ type: "entry", key: `entry:${entry.id}`, entry, index });
    });
    return rows;
}