use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub schema_version: String,
    pub backup_version: String,
    pub created_at_epoch: u64,
    pub source_root: String,
    pub operating_system: String,
    pub openclaw_version: String,
    pub contains_sensitive_data: bool,
    pub redacted_items: Vec<String>,
    pub included_items: Vec<ManifestItem>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestItem {
    pub key: String,
    pub label: String,
    pub relative_path: String,
    pub file_count: usize,
    pub sensitivity: String,
}
