use crate::manifest::{BackupManifest, ManifestItem};
use crate::scan::{scan_openclaw_root, ScanItem};
use serde::Serialize;
use serde_json::Value;
use std::env;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub archive_path: String,
    pub manifest_path: String,
    pub included_items: Vec<String>,
    pub excluded_sensitive_items: Vec<String>,
    pub redacted_items: Vec<String>,
    pub item_count: usize,
    pub contains_sensitive_data: bool,
    pub openclaw_version: String,
}

pub fn export_backup_archive(
    root_path: Option<String>,
    selected_keys: Vec<String>,
    output_path: Option<String>,
    include_sensitive_data: bool,
) -> Result<ExportResult, String> {
    if selected_keys.is_empty() {
        return Err("至少需要选择 1 个备份项。".to_string());
    }

    let snapshot = scan_openclaw_root(root_path)?;
    let filtered_items: Vec<ScanItem> = snapshot
        .items
        .into_iter()
        .filter(|item| item.selected && selected_keys.iter().any(|key| key == &item.key))
        .collect();

    if filtered_items.is_empty() {
        return Err("当前没有可导出的有效项目。".to_string());
    }

    let (selected_items, excluded_sensitive_items): (Vec<_>, Vec<_>) =
        filtered_items.into_iter().partition(|item| {
            include_sensitive_data || item.sensitivity != "sensitive" || item.key == "config"
        });

    if selected_items.is_empty() {
        return Err("当前选择的项目都属于敏感信息，至少保留 1 个可导出项后再试。".to_string());
    }

    let output_path = resolve_archive_path(output_path)?;
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let file = File::create(&output_path).map_err(|error| error.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    let manifest = BackupManifest {
        schema_version: "2".to_string(),
        backup_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at_epoch: current_unix_timestamp()?,
        source_root: snapshot.root_path.clone(),
        operating_system: env::consts::OS.to_string(),
        openclaw_version: snapshot.detected_openclaw_version.clone(),
        contains_sensitive_data: selected_items
            .iter()
            .any(|item| item.sensitivity == "sensitive"),
        redacted_items: if include_sensitive_data {
            Vec::new()
        } else {
            selected_items
                .iter()
                .filter(|item| item.key == "config")
                .map(|item| item.label.clone())
                .collect()
        },
        included_items: selected_items
            .iter()
            .map(|item| ManifestItem {
                key: item.key.clone(),
                label: item.label.clone(),
                relative_path: item.path.trim_end_matches('/').to_string(),
                file_count: item.file_count,
                sensitivity: item.sensitivity.clone(),
            })
            .collect(),
    };

    zip.start_file("openclaw-backup/manifest.json", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(
        serde_json::to_string_pretty(&manifest)
            .map_err(|error| error.to_string())?
            .as_bytes(),
    )
    .map_err(|error| error.to_string())?;

    for item in &selected_items {
        let relative_path = item.path.trim_end_matches('/');
        let source_path = Path::new(&snapshot.root_path).join(relative_path);
        let archive_base = Path::new("openclaw-backup").join(relative_path);

        if source_path.is_file() {
            if item.key == "config" && !include_sensitive_data {
                write_sanitized_config_to_zip(&mut zip, &source_path, &archive_base, options)?;
            } else {
                write_file_to_zip(&mut zip, &source_path, &archive_base, options)?;
            }
        } else if source_path.is_dir() {
            write_directory_to_zip(&mut zip, &source_path, &archive_base, options)?;
        }
    }

    zip.finish().map_err(|error| error.to_string())?;

    Ok(ExportResult {
        archive_path: output_path.to_string_lossy().to_string(),
        manifest_path: "openclaw-backup/manifest.json".to_string(),
        included_items: selected_items
            .iter()
            .map(|item| item.label.clone())
            .collect(),
        excluded_sensitive_items: excluded_sensitive_items
            .iter()
            .map(|item| item.label.clone())
            .collect(),
        redacted_items: manifest.redacted_items.clone(),
        item_count: selected_items.len(),
        contains_sensitive_data: manifest.contains_sensitive_data,
        openclaw_version: manifest.openclaw_version,
    })
}

fn resolve_archive_path(output_path: Option<String>) -> Result<PathBuf, String> {
    let provided = output_path
        .filter(|path| !path.trim().is_empty())
        .ok_or_else(|| "未提供导出路径。".to_string())?;

    let mut path = PathBuf::from(provided);
    if path.extension().is_none() {
        path.set_extension("zip");
    }

    Ok(path)
}

fn current_unix_timestamp() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| error.to_string())
}

fn write_directory_to_zip(
    zip: &mut ZipWriter<File>,
    source_dir: &Path,
    archive_dir: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    for entry in fs::read_dir(source_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        let archive_path = archive_dir.join(entry.file_name());

        if entry_path.is_file() {
            write_file_to_zip(zip, &entry_path, &archive_path, options)?;
        } else if entry_path.is_dir() {
            write_directory_to_zip(zip, &entry_path, &archive_path, options)?;
        }
    }

    Ok(())
}

fn write_file_to_zip(
    zip: &mut ZipWriter<File>,
    source_path: &Path,
    archive_path: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    let mut file = File::open(source_path).map_err(|error| error.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|error| error.to_string())?;

    zip.start_file(archive_path.to_string_lossy().as_ref(), options)
        .map_err(|error| error.to_string())?;
    zip.write_all(&buffer).map_err(|error| error.to_string())?;

    Ok(())
}

fn write_sanitized_config_to_zip(
    zip: &mut ZipWriter<File>,
    source_path: &Path,
    archive_path: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    let raw = fs::read_to_string(source_path).map_err(|error| error.to_string())?;
    let mut value = serde_json::from_str::<Value>(&raw).map_err(|error| error.to_string())?;
    redact_sensitive_json(&mut value);
    let buffer = serde_json::to_vec_pretty(&value).map_err(|error| error.to_string())?;

    zip.start_file(archive_path.to_string_lossy().as_ref(), options)
        .map_err(|error| error.to_string())?;
    zip.write_all(&buffer).map_err(|error| error.to_string())?;

    Ok(())
}

fn redact_sensitive_json(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, entry) in map.iter_mut() {
                if is_sensitive_key(key) {
                    *entry = Value::String("<redacted>".to_string());
                } else {
                    redact_sensitive_json(entry);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                redact_sensitive_json(item);
            }
        }
        _ => {}
    }
}

fn is_sensitive_key(key: &str) -> bool {
    matches!(
        key,
        "apiKey" | "appSecret" | "secret" | "token" | "access" | "refresh" | "key"
    )
}
