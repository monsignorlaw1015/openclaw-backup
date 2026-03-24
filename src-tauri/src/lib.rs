mod backup;
mod manifest;
mod restore;
mod scan;

use backup::{export_backup_archive, ExportResult};
use restore::{
    inspect_backup_archive, preflight_restore_archive, restore_backup_archive,
    RestoreExecutionResult, RestorePreflightReport, RestoreScanSnapshot,
};
use scan::{default_openclaw_path, scan_openclaw_root, ScanSnapshot};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    message: String,
}

#[tauri::command]
fn get_default_openclaw_path() -> Result<String, ErrorPayload> {
    default_openclaw_path().map_err(|message| ErrorPayload { message })
}

#[tauri::command]
fn scan_openclaw(path: Option<String>) -> Result<ScanSnapshot, ErrorPayload> {
    scan_openclaw_root(path).map_err(|message| ErrorPayload { message })
}

#[tauri::command]
fn export_backup(
    path: Option<String>,
    selected_keys: Vec<String>,
    output_path: Option<String>,
    include_sensitive_data: bool,
) -> Result<ExportResult, ErrorPayload> {
    export_backup_archive(path, selected_keys, output_path, include_sensitive_data)
        .map_err(|message| ErrorPayload { message })
}

#[tauri::command]
fn inspect_backup(path: String) -> Result<RestoreScanSnapshot, ErrorPayload> {
    inspect_backup_archive(path).map_err(|message| ErrorPayload { message })
}

#[tauri::command]
fn preflight_restore(
    root_path: String,
    archive_path: String,
) -> Result<RestorePreflightReport, ErrorPayload> {
    preflight_restore_archive(root_path, archive_path).map_err(|message| ErrorPayload { message })
}

#[tauri::command]
fn restore_backup(
    root_path: String,
    archive_path: String,
    selected_keys: Vec<String>,
) -> Result<RestoreExecutionResult, ErrorPayload> {
    restore_backup_archive(root_path, archive_path, selected_keys)
        .map_err(|message| ErrorPayload { message })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_default_openclaw_path,
            scan_openclaw,
            export_backup,
            inspect_backup,
            preflight_restore,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::backup::export_backup_archive;
    use super::restore::{
        inspect_backup_archive, preflight_restore_archive, restore_backup_archive,
    };
    use super::scan::scan_openclaw_root;
    use std::env;
    use std::fs::{self, File};
    use std::io::Read;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::ZipArchive;

    fn real_openclaw_root() -> Option<String> {
        let home = env::var("HOME").ok()?;
        let path = Path::new(&home).join(".openclaw");
        if path.is_dir() {
            Some(path.to_string_lossy().to_string())
        } else {
            None
        }
    }

    fn unique_temp_path(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_millis())
            .unwrap_or_default();
        env::temp_dir().join(format!("openclaw-backup-{}-{}", name, stamp))
    }

    #[test]
    fn scans_real_openclaw_root_layout() {
        let Some(root) = real_openclaw_root() else {
            return;
        };

        let snapshot = scan_openclaw_root(Some(root)).expect("scan should succeed");
        assert!(!snapshot.items.is_empty());
        assert_ne!(snapshot.detected_openclaw_version, "unknown");

        let available_keys = snapshot
            .items
            .iter()
            .filter(|item| item.availability == "available")
            .map(|item| item.key.as_str())
            .collect::<Vec<_>>();

        assert!(available_keys.contains(&"config"));
        assert!(available_keys.contains(&"authProfiles"));
        assert!(available_keys.contains(&"identity"));
        assert!(available_keys.contains(&"sessions"));
    }

    #[test]
    fn export_preflight_restore_roundtrip_on_real_data() {
        let Some(root) = real_openclaw_root() else {
            return;
        };

        let snapshot = scan_openclaw_root(Some(root.clone())).expect("scan should succeed");
        let selected_keys = snapshot
            .items
            .iter()
            .filter(|item| item.availability == "available")
            .map(|item| item.key.clone())
            .collect::<Vec<_>>();

        let archive_dir = unique_temp_path("archive");
        let restore_dir = unique_temp_path("restore");
        fs::create_dir_all(&archive_dir).expect("should create archive dir");
        fs::create_dir_all(&restore_dir).expect("should create restore dir");

        let archive_path = archive_dir.join("roundtrip.zip");
        let export = export_backup_archive(
            Some(root),
            selected_keys.clone(),
            Some(archive_path.to_string_lossy().to_string()),
            true,
        )
        .expect("export should succeed");

        let inspected =
            inspect_backup_archive(export.archive_path.clone()).expect("inspect should succeed");
        assert!(!inspected.items.is_empty());

        let preflight = preflight_restore_archive(
            restore_dir.to_string_lossy().to_string(),
            export.archive_path.clone(),
        )
        .expect("preflight should succeed");
        assert!(preflight.can_proceed);

        let restore = restore_backup_archive(
            restore_dir.to_string_lossy().to_string(),
            export.archive_path.clone(),
            selected_keys,
        )
        .expect("restore should succeed");
        assert!(restore.restored_count > 0);

        assert!(restore_dir.join("openclaw.json").exists());
        assert!(restore_dir
            .join("agents/main/agent/auth-profiles.json")
            .exists());
        assert!(restore_dir
            .join("agents/main/sessions/sessions.json")
            .exists());
        assert!(restore_dir.join("identity/device.json").exists());
        assert!(restore_dir
            .join("extensions/feishu-openclaw-plugin/openclaw.plugin.json")
            .exists());

        let _ = fs::remove_dir_all(archive_dir);
        let _ = fs::remove_dir_all(restore_dir);
    }

    #[test]
    fn export_without_sensitive_data_redacts_main_config() {
        let Some(root) = real_openclaw_root() else {
            return;
        };

        let archive_dir = unique_temp_path("redacted");
        fs::create_dir_all(&archive_dir).expect("should create archive dir");
        let archive_path = archive_dir.join("redacted.zip");

        let export = export_backup_archive(
            Some(root),
            vec![
                "config".to_string(),
                "authProfiles".to_string(),
                "identity".to_string(),
            ],
            Some(archive_path.to_string_lossy().to_string()),
            false,
        )
        .expect("export should succeed");

        assert!(export.included_items.iter().any(|item| item == "主配置"));
        assert!(export
            .excluded_sensitive_items
            .iter()
            .any(|item| item == "认证配置"));

        let file = File::open(&export.archive_path).expect("archive should exist");
        let mut archive = ZipArchive::new(file).expect("archive should be readable");

        let mut config = String::new();
        archive
            .by_name("openclaw-backup/openclaw.json")
            .expect("config should exist")
            .read_to_string(&mut config)
            .expect("config should be readable");

        assert!(config.contains("\"appSecret\": \"<redacted>\""));
        assert!(config.contains("\"token\": \"<redacted>\""));
        assert!(!config.contains("sHS0c3L4yHjfYrK21sYvsdDDmoabCdnA"));

        assert!(archive
            .by_name("openclaw-backup/agents/main/agent/auth-profiles.json")
            .is_err());

        let _ = fs::remove_dir_all(archive_dir);
    }
}
