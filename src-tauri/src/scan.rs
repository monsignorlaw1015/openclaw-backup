use serde::Serialize;
use serde_json::Value;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanItem {
    pub key: String,
    pub label: String,
    pub path: String,
    pub description: String,
    pub category: String,
    pub sensitivity: String,
    pub availability: String,
    pub detail: String,
    pub selected: bool,
    pub file_count: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSnapshot {
    pub root_path: String,
    pub detected_openclaw_version: String,
    pub available_item_count: usize,
    pub items: Vec<ScanItem>,
}

pub struct ScanDefinition {
    pub key: &'static str,
    pub label: &'static str,
    pub candidates: &'static [&'static str],
    pub description: &'static str,
    pub category: &'static str,
    pub sensitivity: &'static str,
    pub default_selected: bool,
    pub is_dir: bool,
}

const DEFINITIONS: [ScanDefinition; 10] = [
    ScanDefinition {
        key: "config",
        label: "主配置",
        candidates: &["openclaw.json"],
        description: "OpenClaw 主配置，包含模型、命令、Channel、Gateway 等设置。",
        category: "configuration",
        sensitivity: "internal",
        default_selected: true,
        is_dir: false,
    },
    ScanDefinition {
        key: "authProfiles",
        label: "认证配置",
        candidates: &["agents/main/agent/auth-profiles.json"],
        description: "Provider API Key、OAuth Token 与默认认证配置。",
        category: "security",
        sensitivity: "sensitive",
        default_selected: true,
        is_dir: false,
    },
    ScanDefinition {
        key: "identity",
        label: "设备身份",
        candidates: &["identity"],
        description: "设备配对、登录态与本机身份信息。",
        category: "security",
        sensitivity: "sensitive",
        default_selected: true,
        is_dir: true,
    },
    ScanDefinition {
        key: "memory",
        label: "记忆",
        candidates: &["memory"],
        description: "长期记忆与个性化上下文数据。",
        category: "data",
        sensitivity: "internal",
        default_selected: true,
        is_dir: true,
    },
    ScanDefinition {
        key: "skills",
        label: "技能",
        candidates: &["skills"],
        description: "已安装技能与本地扩展能力。",
        category: "customization",
        sensitivity: "internal",
        default_selected: true,
        is_dir: true,
    },
    ScanDefinition {
        key: "workspace",
        label: "工作区",
        candidates: &["workspace"],
        description: "项目工作区与关联上下文。",
        category: "data",
        sensitivity: "internal",
        default_selected: true,
        is_dir: true,
    },
    ScanDefinition {
        key: "agents",
        label: "Agent 模型配置",
        candidates: &["agents/main/agent/models.json"],
        description: "Agent 运行模型与默认行为配置。",
        category: "customization",
        sensitivity: "internal",
        default_selected: true,
        is_dir: false,
    },
    ScanDefinition {
        key: "sessions",
        label: "对话历史",
        candidates: &["agents/main/sessions"],
        description: "历史会话、上下文与迁移后最容易丢失的记录。",
        category: "data",
        sensitivity: "internal",
        default_selected: true,
        is_dir: true,
    },
    ScanDefinition {
        key: "extensions",
        label: "插件扩展",
        candidates: &["extensions"],
        description: "已安装插件、扩展技能与第三方接入能力。",
        category: "integration",
        sensitivity: "internal",
        default_selected: true,
        is_dir: true,
    },
    ScanDefinition {
        key: "jobs",
        label: "定时任务",
        candidates: &["cron/jobs.json"],
        description: "本地 cron 任务与自动化作业配置。",
        category: "integration",
        sensitivity: "internal",
        default_selected: true,
        is_dir: false,
    },
];

pub fn restore_scan_definitions() -> &'static [ScanDefinition; 10] {
    &DEFINITIONS
}

pub fn default_openclaw_path() -> Result<String, String> {
    let home = env::var("HOME").map_err(|_| "无法识别当前用户主目录".to_string())?;
    Ok(Path::new(&home)
        .join(".openclaw")
        .to_string_lossy()
        .to_string())
}

pub fn scan_openclaw_root(root_path: Option<String>) -> Result<ScanSnapshot, String> {
    let root = root_path
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(default_openclaw_path()?);

    let root_dir = PathBuf::from(&root);
    validate_root_dir(&root_dir, "OpenClaw 根目录")?;

    let items = DEFINITIONS
        .iter()
        .map(|definition| scan_item(definition, &root_dir))
        .collect::<Vec<_>>();
    let available_item_count = items
        .iter()
        .filter(|item| item.availability == "available")
        .count();

    Ok(ScanSnapshot {
        root_path: root,
        detected_openclaw_version: detect_openclaw_version(&root_dir),
        available_item_count,
        items,
    })
}

pub fn detect_openclaw_version(root_dir: &Path) -> String {
    let candidates = [
        root_dir.join("openclaw.json"),
        root_dir.join("manifest.json"),
        root_dir.join("meta.json"),
    ];

    for candidate in candidates {
        let Ok(raw) = fs::read_to_string(candidate) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };

        for path in [
            &["meta", "lastTouchedVersion"][..],
            &["wizard", "lastRunVersion"][..],
        ] {
            if let Some(version) = read_nested_string(&value, path) {
                let trimmed = version.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }

        for key in [
            "openclawVersion",
            "openclaw_version",
            "version",
            "appVersion",
        ] {
            if let Some(version) = value.get(key).and_then(Value::as_str) {
                let trimmed = version.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }

    "unknown".to_string()
}

pub fn validate_root_dir(root_dir: &Path, label: &str) -> Result<(), String> {
    if !root_dir.exists() {
        return Err(format!("{}不存在：{}", label, root_dir.to_string_lossy()));
    }

    if !root_dir.is_dir() {
        return Err(format!("{}不是目录：{}", label, root_dir.to_string_lossy()));
    }

    Ok(())
}

fn scan_item(definition: &ScanDefinition, root_dir: &Path) -> ScanItem {
    let resolved = resolve_target(root_dir, definition);

    let (path, availability, detail, selected, file_count) = match resolved {
        Some((relative_path, target)) => {
            let (availability, detail, selected, file_count) =
                if definition.is_dir && target.is_dir() {
                    inspect_directory(&target, definition.default_selected)
                } else if !definition.is_dir && target.is_file() {
                    inspect_file(&target, definition.default_selected)
                } else if target.is_dir() {
                    inspect_directory(&target, definition.default_selected)
                } else if target.is_file() {
                    inspect_file(&target, definition.default_selected)
                } else {
                    (
                        "missing".to_string(),
                        "路径存在，但类型与备份规则不匹配。".to_string(),
                        false,
                        0,
                    )
                };

            (
                relative_path.to_string(),
                availability,
                detail,
                selected,
                file_count,
            )
        }
        None => (
            definition.candidates[0].to_string(),
            "missing".to_string(),
            "当前目录中未找到该项目。".to_string(),
            false,
            0,
        ),
    };

    ScanItem {
        key: definition.key.to_string(),
        label: definition.label.to_string(),
        path: if path.ends_with('/') || !definition.is_dir {
            path
        } else {
            format!("{}/", path)
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

fn resolve_target(root_dir: &Path, definition: &ScanDefinition) -> Option<(&'static str, PathBuf)> {
    for candidate in definition.candidates {
        let target = root_dir.join(candidate);
        if target.exists() {
            return Some((candidate, target));
        }
    }

    None
}

fn inspect_file(path: &Path, default_selected: bool) -> (String, String, bool, usize) {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() && metadata.len() > 0 => (
            "available".to_string(),
            format!(
                "已识别文件，大小 {:.1} KB。",
                metadata.len() as f64 / 1024.0
            ),
            default_selected,
            1,
        ),
        Ok(metadata) if metadata.is_file() => (
            "empty".to_string(),
            format!("文件存在，但大小为 {} 字节，视为空文件。", metadata.len()),
            false,
            0,
        ),
        Ok(_) => (
            "missing".to_string(),
            "路径存在，但不是可备份的文件。".to_string(),
            false,
            0,
        ),
        Err(error) => (
            "missing".to_string(),
            format!("无法读取文件信息：{}", error),
            false,
            0,
        ),
    }
}

fn inspect_directory(path: &Path, default_selected: bool) -> (String, String, bool, usize) {
    match count_files(path) {
        Ok(0) => (
            "empty".to_string(),
            "目录存在，但当前没有可备份文件。".to_string(),
            false,
            0,
        ),
        Ok(file_count) => (
            "available".to_string(),
            format!("目录存在，已识别 {} 个文件。", file_count),
            default_selected,
            file_count,
        ),
        Err(error) => (
            "missing".to_string(),
            format!("无法读取目录内容：{}", error),
            false,
            0,
        ),
    }
}

pub fn count_files(path: &Path) -> Result<usize, String> {
    let entries = fs::read_dir(path).map_err(|error| error.to_string())?;
    let mut count = 0usize;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        let metadata = entry.metadata().map_err(|error| error.to_string())?;

        if metadata.is_file() {
            count += 1;
        } else if metadata.is_dir() {
            count += count_files(&entry_path)?;
        }
    }

    Ok(count)
}

fn read_nested_string<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    current.as_str()
}
