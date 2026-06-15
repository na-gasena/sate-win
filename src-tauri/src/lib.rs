use std::process::Command;
use tauri::Manager;

/// text-site リポジトリへ公開用 md をコミット & プッシュする。
///
/// JS 側で content/<slug>.md を書き出した後に呼ぶ。ここでは git 操作だけを担う。
/// - `repo_dir`: text-site リポジトリのルート（設定の publishDir）
/// - `rel_path`: リポジトリルートからの相対パス（例 `content/2026-06-15-001.md`）
/// - `message`: コミットメッセージ
///
/// 公開は git push → Cloudflare Pages CI で世に出る（text-site spec §8）。
/// push の認証はユーザーのローカル git 設定（credential helper / SSH）に依存する。
#[tauri::command]
fn publish_to_site(repo_dir: String, rel_path: String, message: String) -> Result<String, String> {
    let git = |args: &[&str]| {
        Command::new("git")
            .arg("-C")
            .arg(&repo_dir)
            .args(args)
            .output()
    };

    // 各 git ステップの実行ログ（stdout + stderr）を 1 行に整形する。
    let fmt = |label: &str, out: &std::process::Output| {
        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        let body = format!("{stdout}{stderr}");
        let body = body.trim();
        if body.is_empty() {
            format!("$ git {label}\n(出力なし)")
        } else {
            format!("$ git {label}\n{body}")
        }
    };

    let mut log = String::new();

    let add = git(&["add", "--", &rel_path]).map_err(|e| format!("git add 実行失敗: {e}"))?;
    log.push_str(&fmt("add", &add));
    if !add.status.success() {
        return Err(format!("git add に失敗しました。\n\n{log}"));
    }

    let commit = git(&["commit", "-m", &message]).map_err(|e| format!("git commit 実行失敗: {e}"))?;
    log.push_str("\n\n");
    log.push_str(&fmt("commit", &commit));
    if !commit.status.success() {
        // 変更が無い場合（既に同一内容でコミット済み）は push に進む。
        // それ以外のコミット失敗はエラーとして返す。
        let combined = format!(
            "{}{}",
            String::from_utf8_lossy(&commit.stdout),
            String::from_utf8_lossy(&commit.stderr)
        );
        if !combined.contains("nothing to commit") && !combined.contains("no changes added") {
            return Err(format!("git commit に失敗しました。\n\n{log}"));
        }
    }

    let push = git(&["push"]).map_err(|e| format!("git push 実行失敗: {e}"))?;
    log.push_str("\n\n");
    log.push_str(&fmt("push", &push));
    if !push.status.success() {
        return Err(format!(
            "git push に失敗しました（認証設定を確認してください）。\n\n{log}"
        ));
    }

    Ok(log)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![publish_to_site])
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
