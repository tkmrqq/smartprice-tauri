// Скрывает консольное окно cmd в release-сборке (в debug — оставляем,
// удобно видеть println!/eprintln! при разработке).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Вся бизнес-логика (расчёт цен, парсинг ЭДИН, раскладка OCR, генерация
// ценников) сознательно оставлена на стороне Vue/JS — см. src/lib/*.js.
// Rust-часть здесь нужна только как нативная оболочка Tauri и мост к
// системным возможностям через официальные плагины (SQLite, файлы,
// диалоги, HTTP для Google Vision, постоянное key-value хранилище).

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running SmartPrice-РБ");
}
