use crate::manifest::BackupManifest;
use crate::scan::{
    count_files, detect_openclaw_version, restore_scan_definitions, validate_root_dir,
    ScanDefinition, ScanItem,
};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use zip::ZipArchive;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreflightIssue {
    pub severity: String,
    pub code: String,
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreflightReport {
    pub root_path: String,
    pub archive_path: String,
    pub target_openclaw_version: String,
    pub archive_openclaw_version: String,
    pub contains_sensitive_data: bool,
    pub redacted_items: Vec<String>,
    pub running_process_detected: bool,
    pub can_proceed: bool,
    pub should_warn: bool,
    pub issues: Vec<RestorePreflightIssue>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreScanSnapshot {
    pub archive_path: String,
    pub detected_openclaw_version: String,
    pub contains_sensitive_data: bool,
    pub redacted_items: Vec<String>,
    pub manifest_missing: bool,
    pub items: Vec<ScanItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreItemResult {
    pub label: String,
    pub status: String,
    pub detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreExecutionResult {
    pub archive_path: String,
    pub restored_count: usize,
    pub failed_count: usize,
    pub status: String,
    pub preflight: RestorePreflightReport,
    pub results: Vec<RestoreItemResult>,
}

struct RestoreVerification {
    restored_files: usize,
    missing_files: Vec<String>,
    mismatched_files: Vec<String>,
    extra_files: Vec<String>,
}

pub fn inspect_backup_archive(archive_path: String) -> Result<RestoreScanSnapshot, String> {
    let mut archive = open_archive(&archive_path)?;
    let names = collect_entry_names(&mut archive);
    let manifest = read_manifest(&mut archive)?;
    let manifest_missing = manifest.is_none();
    let manifest_map = manifest_item_map(manifest.as_ref());

    let items = restore_scan_definitions()
        .iter()
        .map(|definition| inspect_archive_item(definition, &names, &manifest_map))
        .collect::<Vec<_>>();

    Ok(RestoreScanSnapshot {
        archive_path,
        detected_openclaw_version: manifest
            .as_ref()
            .map(|value| value.openclaw_version.clone())
            .unwrap_or_else(|| "unknown".to_string()),
        contains_sensitive_data: manifest
            .as_ref()
            .map(|value| value.contains_sensitive_data)
            .unwrap_or(false),
        redacted_items: manifest
            .as_ref()
            .map(|value| value.redacted_items.clone())
            .unwrap_or_default(),
        manifest_missing,
        items,
    })
}

pub fn preflight_restore_archive(
    root_path: String,
    archive_path: String,
) -> Result<RestorePreflightReport, String> {
    let target_root = PathBuf::from(&root_path);
    validate_root_dir(&target_root, "目标根目录")?;

    let snapshot = inspect_backup_archive(archive_path.clone())?;
    let target_version = detect_openclaw_version(&target_root);
    let running_process_detected = is_openclaw_running();

    let mut issues = Vec::new();
    if snapshot.manifest_missing {
        issues.push(RestorePreflightIssue {
            severity: "warning".to_string(),
            code: "manifest_missing".to_string(),
            message: "备份包缺少 manifest.json，将按兼容模式识别内容。".to_string(),
        });
    }

    if running_process_detected {
        issues.push(RestorePreflightIssue {
            severity: "warning".to_string(),
            code: "process_running".to_string(),
            message: "检测到 OpenClaw 可能仍在运行，导入前建议先关闭。".to_string(),
        });
    }

    if snapshot
        .items
        .iter()
        .all(|item| item.availability != "available")
    {
        issues.push(RestorePreflightIssue {
            severity: "blocking".to_string(),
            code: "archive_empty".to_string(),
            message: "备份包中没有可恢复内容，无法继续导入。".to_string(),
        });
    }

    if snapshot.detected_openclaw_version != "unknown"
        && target_version != "unknown"
        && snapshot.detected_openclaw_version != target_version
    {
        issues.push(RestorePreflightIssue {
            severity: "warning".to_string(),
            code: "version_mismatch".to_string(),
            message: format!(
                "备份包版本为 {}，当前目录版本为 {}，恢复后可能需要手动校验兼容性。",
                snapshot.detected_openclaw_version, target_version
            ),
        });
    }

    if !snapshot.contains_sensitive_data {
        issues.push(RestorePreflightIssue {
            severity: "warning".to_string(),
            code: "sensitive_data_excluded".to_string(),
            message: "当前备份包不包含敏感信息，恢复后可能仍需重新填写 API Key 或 Token。"
                .to_string(),
        });
    }

    if !snapshot.redacted_items.is_empty() {
        issues.push(RestorePreflightIssue {
            severity: "warning".to_string(),
            code: "redacted_items".to_string(),
            message: format!(
                "以下项目已做脱敏处理：{}。恢复后请检查并补齐相关密钥。",
                snapshot.redacted_items.join("、")
            ),
        });
    }

    let can_proceed = !issues.iter().any(|issue| issue.severity == "blocking");
    let should_warn = issues.iter().any(|issue| issue.severity == "warning");

    Ok(RestorePreflightReport {
        root_path,
        archive_path,
        target_openclaw_version: target_version,
        archive_openclaw_version: snapshot.detected_openclaw_version,
        contains_sensitive_data: snapshot.contains_sensitive_data,
        redacted_items: snapshot.redacted_items,
        running_process_detected,
        can_proceed,
        should_warn,
        issues,
    })
}

pub fn restore_backup_archive(
    root_path: String,
    archive_path: String,
    selected_keys: Vec<String>,
) -> Result<RestoreExecutionResult, String> {
    if selected_keys.is_empty() {
        return Err("至少需要选择 1 个恢复项。".to_string());
    }

    let preflight = preflight_restore_archive(root_path.clone(), archive_path.clone())?;
    if !preflight.can_proceed {
        return Err("导入前检查未通过，请先处理阻断问题。".to_string());
    }

    let snapshot = inspect_backup_archive(archive_path.clone())?;
    let target_root = PathBuf::from(&root_path);

    let mut results = Vec::new();
    let mut restored_count = 0usize;
    let mut failed_count = 0usize;
    let mut warning_count = 0usize;

    for item in snapshot.items {
        if !selected_keys.iter().any(|key| key == &item.key) {
            continue;
        }

        if item.availability != "available" {
            failed_count += 1;
            results.push(RestoreItemResult {
                label: item.label,
                status: "error".to_string(),
                detail: "该项在备份包中不可恢复。".to_string(),
            });
            continue;
        }

        match restore_item(&archive_path, &target_root, &item.path) {
            Ok(verification) => {
                restored_count += 1;
                if verification.extra_files.is_empty() {
                    results.push(RestoreItemResult {
                        label: item.label,
                        status: "success".to_string(),
                        detail: format!("已恢复并校验 {} 个文件。", verification.restored_files),
                    });
                } else {
                    warning_count += 1;
                    let sample = summarize_paths(&verification.extra_files);
                    results.push(RestoreItemResult {
                        label: item.label,
                        status: "warning".to_string(),
                        detail: format!(
                            "已恢复并校验 {} 个文件，但目标目录还保留 {} 个备份包之外的文件：{}。",
                            verification.restored_files,
                            verification.extra_files.len(),
                            sample
                        ),
                    });
                }
            }
            Err(error) => {
                failed_count += 1;
                results.push(RestoreItemResult {
                    label: item.label,
                    status: "error".to_string(),
                    detail: error,
                });
            }
        }
    }

    let status = if failed_count > 0 || warning_count > 0 {
        "warning"
    } else if restored_count > 0 {
        "success"
    } else {
        "error"
    }
    .to_string();

    Ok(RestoreExecutionResult {
        archive_path,
        restored_count,
        failed_count,
        status,
        preflight,
        results,
    })
}

fn inspect_archive_item(
    definition: &ScanDefinition,
    names: &[String],
    manifest_map: &HashMap<String, String>,
) -> ScanItem {
    let relative_path = manifest_map
        .get(definition.key)
        .cloned()
        .unwrap_or_else(|| definition.candidates[0].to_string());
    let archive_path = format!("openclaw-backup/{}", relative_path.trim_end_matches('/'));

    let (availability, detail, selected, file_count) = if names
        .iter()
        .any(|name| name == &archive_path)
    {
        (
            "available".to_string(),
            format!("备份包中包含文件：{}。", archive_path),
            true,
            1,
        )
    } else {
        let file_count = names
            .iter()
            .filter(|name| name.starts_with(&(archive_path.clone() + "/")) && !name.ends_with('/'))
            .count();

        if file_count > 0 {
            (
                "available".to_string(),
                format!("备份包内包含 {} 个文件。", file_count),
                true,
                file_count,
            )
        } else {
            (
                "missing".to_string(),
                "备份包中未包含该项目。".to_string(),
                false,
                0,
            )
        }
    };

    ScanItem {
        key: definition.key.to_string(),
        label: definition.label.to_string(),
        path: if relative_path.ends_with('/') || !definition.is_dir {
            relative_path
        } else {
            format!("{}/", relative_path)
        },
        description: definition.description.to_string(),
        category: definition.category.to_string(),
        sensitivity: definition.sensitivity.to_string(),
        availability,
        detail,
        selected,
        file_count,
    }
}

fn read_manifest(archive: &mut ZipArchive<File>) -> Result<Option<BackupManifest>, String> {
    let Ok(mut entry) = archive.by_name("openclaw-backup/manifest.json") else {
        return Ok(None);
    };

    let mut raw = String::new();
    entry
        .read_to_string(&mut raw)
        .map_err(|error| error.to_string())?;
    let manifest =
        serde_json::from_str::<BackupManifest>(&raw).map_err(|error| error.to_string())?;
    Ok(Some(manifest))
}

fn manifest_item_map(manifest: Option<&BackupManifest>) -> HashMap<String, String> {
    let mut result = HashMap::new();
    if let Some(value) = manifest {
        for item in &value.included_items {
            result.insert(item.key.clone(), item.relative_path.clone());
        }
    }
    result
}

fn restore_item(
    archive_path: &str,
    target_root: &Path,
    relative_path: &str,
) -> Result<RestoreVerification, String> {
    let mut archive = open_archive(archive_path)?;
    let archive_prefix = format!("openclaw-backup/{}", relative_path.trim_end_matches('/'));
    let mut restored_files = 0usize;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = entry.name().to_string();

        let matches_item =
            name == archive_prefix || name.starts_with(&(archive_prefix.clone() + "/"));
        if !matches_item || name.ends_with('/') {
            continue;
        }

        let stripped = name
            .strip_prefix("openclaw-backup/")
            .ok_or_else(|| "备份包内部路径格式不正确。".to_string())?;
        let output_path = target_root.join(stripped);

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let mut output = File::create(&output_path).map_err(|error| error.to_string())?;
        let mut buffer = Vec::new();
        entry
            .read_to_end(&mut buffer)
            .map_err(|error| error.to_string())?;
        output
            .write_all(&buffer)
            .map_err(|error| error.to_string())?;
        restored_files += 1;
    }

    if restored_files == 0 {
        return Err("未在备份包中找到可恢复文件。".to_string());
    }

    let verification =
        verify_restored_item(archive_path, target_root, relative_path, restored_files)?;
    if !verification.missing_files.is_empty() || !verification.mismatched_files.is_empty() {
        let mut messages = Vec::new();
        if !verification.missing_files.is_empty() {
            messages.push(format!(
                "缺少 {} 个文件（{}）",
                verification.missing_files.len(),
                summarize_paths(&verification.missing_files)
            ));
        }
        if !verification.mismatched_files.is_empty() {
            messages.push(format!(
                "有 {} 个文件内容不一致（{}）",
                verification.mismatched_files.len(),
                summarize_paths(&verification.mismatched_files)
            ));
        }

        return Err(format!(
            "已写入 {} 个文件，但恢复后校验未通过：{}。",
            verification.restored_files,
            messages.join("，")
        ));
    }

    Ok(verification)
}

fn open_archive(path: &str) -> Result<ZipArchive<File>, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    ZipArchive::new(file).map_err(|error| error.to_string())
}

fn collect_entry_names(archive: &mut ZipArchive<File>) -> Vec<String> {
    (0..archive.len())
        .filter_map(|index| {
            archive
                .by_index(index)
                .ok()
                .map(|entry| entry.name().to_string())
        })
        .collect()
}

fn verify_restored_item(
    archive_path: &str,
    target_root: &Path,
    relative_path: &str,
    restored_files: usize,
) -> Result<RestoreVerification, String> {
    let mut archive = open_archive(archive_path)?;
    let archive_prefix = format!("openclaw-backup/{}", relative_path.trim_end_matches('/'));
    let relative_prefix = relative_path.trim_end_matches('/').to_string();

    let mut archive_files = Vec::new();
    let mut missing_files = Vec::new();
    let mut mismatched_files = Vec::new();

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = entry.name().to_string();
        let matches_item =
            name == archive_prefix || name.starts_with(&(archive_prefix.clone() + "/"));
        if !matches_item || name.ends_with('/') {
            continue;
        }

        let stripped = name
            .strip_prefix("openclaw-backup/")
            .ok_or_else(|| "备份包内部路径格式不正确。".to_string())?
            .to_string();
        archive_files.push(stripped.clone());

        let output_path = target_root.join(&stripped);
        if !output_path.exists() {
            missing_files.push(stripped);
            continue;
        }

        let mut archive_buffer = Vec::new();
        entry
            .read_to_end(&mut archive_buffer)
            .map_err(|error| error.to_string())?;
        let target_buffer = fs::read(&output_path).map_err(|error| error.to_string())?;
        if archive_buffer != target_buffer {
            mismatched_files.push(stripped);
        }
    }

    let archive_set: HashSet<_> = archive_files.iter().cloned().collect();
    let target_files = collect_target_files(target_root, &relative_prefix)?;
    let extra_files = target_files
        .into_iter()
        .filter(|path| !archive_set.contains(path))
        .collect();

    Ok(RestoreVerification {
        restored_files,
        missing_files,
        mismatched_files,
        extra_files,
    })
}

fn collect_target_files(target_root: &Path, relative_path: &str) -> Result<Vec<String>, String> {
    let target = target_root.join(relative_path);
    if !target.exists() {
        return Ok(Vec::new());
    }

    if target.is_file() {
        return Ok(vec![relative_path.to_string()]);
    }

    let mut files = Vec::new();
    collect_target_files_recursive(target_root, &target, &mut files)?;
    Ok(files)
}

fn collect_target_files_recursive(
    target_root: &Path,
    current_path: &Path,
    files: &mut Vec<String>,
) -> Result<(), String> {
    for entry in fs::read_dir(current_path).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        let metadata = entry.metadata().map_err(|error| error.to_string())?;

        if metadata.is_file() {
            let relative = entry_path
                .strip_prefix(target_root)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            files.push(relative);
        } else if metadata.is_dir() {
            collect_target_files_recursive(target_root, &entry_path, files)?;
        }
    }

    Ok(())
}

fn summarize_paths(paths: &[String]) -> String {
    let mut samples = paths.iter().take(3).cloned().collect::<Vec<_>>();
    if paths.len() > 3 {
        samples.push("...".to_string());
    }
    samples.join("、")
}

fn is_openclaw_running() -> bool {
    let output = Command::new("ps").args(["-axo", "comm"]).output();
    let Ok(output) = output else {
        return false;
    };

    let Ok(stdout) = String::from_utf8(output.stdout) else {
        return false;
    };

    stdout
        .lines()
        .map(|line| line.trim().to_ascii_lowercase())
        .any(|line| line.contains("openclaw") || line.contains("myagents"))
}

#[allow(dead_code)]
fn count_target_files(path: &Path) -> usize {
    count_files(path).unwrap_or(0)
}
