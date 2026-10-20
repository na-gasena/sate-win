mod platform;

use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn reveal_in_file_manager(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| format!("ファイルを表示できませんでした: {e}"))
}

#[tauri::command]
async fn run_publish_command(
    command: String,
    slug: String,
    title: String,
    content: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        platform::run_publish_command(&command, &slug, &title, &content)
    })
    .await
    .map_err(|e| format!("コマンド実行スレッドの異常終了: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            run_publish_command,
            reveal_in_file_manager
        ])
        .setup(|app| {
            // Get the main window and set fullscreen
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_fullscreen(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
