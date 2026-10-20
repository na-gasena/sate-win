use std::process::Command;

#[cfg(target_os = "windows")]
fn publish_shell(command: &str) -> Command {
    use std::os::windows::process::CommandExt;
    let system_root = std::env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into());
    let executable = std::path::PathBuf::from(system_root)
        .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    let mut shell = Command::new(executable);
    // PowerShell 5.1 is available without pwsh, Git Bash or WSL.
    // Force UTF-8 pipes for Japanese output, and propagate native exit codes.
    let script = format!(
        "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; \
         $OutputEncoding = [Console]::OutputEncoding; \
         $ErrorActionPreference = 'Stop'; $LASTEXITCODE = 0; \
         & {{ {command}\n }}; if ($LASTEXITCODE -ne 0) {{ exit $LASTEXITCODE }}"
    );
    shell.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        &script,
    ]);
    shell.creation_flags(0x08000000); // CREATE_NO_WINDOW: don't flash a console.
    shell
}

#[cfg(not(target_os = "windows"))]
fn publish_shell(command: &str) -> Command {
    // Preserve upstream's login-shell behavior on macOS.
    let executable = std::env::var_os("SHELL").unwrap_or_else(|| "/bin/zsh".into());
    let mut shell = Command::new(executable);
    shell.args(["-lc", command]);
    shell
}

pub fn run_publish_command(
    command: &str,
    slug: &str,
    title: &str,
    content: &str,
) -> Result<String, String> {
    if slug.is_empty() || slug == "." || slug == ".." || slug.contains(['/', '\\', '\0']) {
        return Err("公開ファイル名が不正です".into());
    }
    // Each invocation owns its directory. Drop cleans it up on success and failure.
    let dir = tempfile::Builder::new()
        .prefix("sate-publish-")
        .tempdir()
        .map_err(|e| format!("一時ディレクトリの作成に失敗: {e}"))?;
    let file = dir.path().join(format!("{slug}.md"));
    std::fs::write(&file, content).map_err(|e| format!("一時ファイルの書き出しに失敗: {e}"))?;
    let mut shell = publish_shell(command);
    shell
        .env("SATE_FILE", &file)
        .env("SATE_SLUG", slug)
        .env("SATE_TITLE", title);
    #[cfg(target_os = "windows")]
    let home = std::env::var_os("USERPROFILE");
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var_os("HOME");
    if let Some(home) = home {
        shell.current_dir(home);
    }
    let out = shell
        .output()
        .map_err(|e| format!("公開コマンドを実行できませんでした: {e}"))?;
    let log = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
    .trim()
    .to_string();
    if out.status.success() {
        Ok(log)
    } else {
        let code = out.status.code().map_or("シグナルで終了".to_string(), |c| {
            format!("終了コード {c}")
        });
        Err(if log.is_empty() {
            code
        } else {
            format!("{code}\n\n{log}")
        })
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn publishes_utf8_file_and_environment_then_removes_temporary_directory() {
        let result = run_publish_command(
            "Write-Output $env:SATE_TITLE; Write-Output $env:SATE_SLUG; \
             Get-Content -Raw -Encoding UTF8 -LiteralPath $env:SATE_FILE; Write-Output $env:SATE_FILE",
            "2026-10-20-001", "日本語のタイトル", "公開用の本文 📝",
        ).unwrap();
        assert!(result.contains("日本語のタイトル"), "{result}");
        assert!(result.contains("2026-10-20-001"), "{result}");
        assert!(result.contains("公開用の本文 📝"), "{result}");
        let path = std::path::Path::new(result.lines().last().unwrap());
        assert!(!path.exists());
        assert!(!path.parent().unwrap().exists());
    }

    #[test]
    fn reports_powershell_errors_and_native_exit_codes() {
        let error = run_publish_command("throw '公開失敗'", "draft", "", "").unwrap_err();
        assert!(error.contains("公開失敗"), "{error}");
        let error = run_publish_command("cmd.exe /c exit 37", "draft", "", "").unwrap_err();
        assert!(error.contains("終了コード 37"), "{error}");
        assert!(run_publish_command("exit 0", "draft", "", "").is_ok());
    }

    #[test]
    fn shell_commands_do_not_interpolate_environment_as_code() {
        let title = "日本語'; throw 'must not run'; #";
        let result =
            run_publish_command("Write-Output $env:SATE_TITLE", "draft", title, "").unwrap();
        assert_eq!(result, title);
        assert!(run_publish_command("exit 0", "../outside", "", "").is_err());
    }
}
