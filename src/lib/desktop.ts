import type {
  ExportResult,
  RestoreExecutionResult,
  RestorePreflightReport,
  RestoreScanSnapshot,
  ScanSnapshot,
} from "@/lib/app-types"

export function hasTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function getDefaultOpenClawPath() {
  if (!hasTauriRuntime()) {
    return "~/.openclaw"
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string>("get_default_openclaw_path")
}

export async function scanOpenClaw(path?: string) {
  if (!hasTauriRuntime()) {
    throw new Error("Tauri runtime unavailable")
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<ScanSnapshot>("scan_openclaw", { path })
}

export async function exportBackup(
  path: string,
  selectedKeys: string[],
  includeSensitiveData: boolean
) {
  if (!hasTauriRuntime()) {
    throw new Error("Tauri runtime unavailable")
  }

  const { invoke } = await import("@tauri-apps/api/core")
  const outputPath = await pickBackupSavePath(path)

  if (!outputPath) {
    return null
  }

  return invoke<ExportResult>("export_backup", {
    path,
    selectedKeys,
    outputPath,
    includeSensitiveData,
  })
}

export async function pickOpenClawDirectory(currentPath?: string) {
  if (!hasTauriRuntime()) {
    throw new Error("Tauri runtime unavailable")
  }

  const { open } = await import("@tauri-apps/plugin-dialog")
  const selected = await open({
    defaultPath: currentPath,
    directory: true,
    multiple: false,
    title: "选择 OpenClaw 根目录",
  })

  return typeof selected === "string" ? selected : null
}

export async function pickBackupArchive(currentPath?: string) {
  if (!hasTauriRuntime()) {
    throw new Error("Tauri runtime unavailable")
  }

  const { open } = await import("@tauri-apps/plugin-dialog")
  const selected = await open({
    defaultPath: currentPath,
    directory: false,
    multiple: false,
    filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    title: "选择备份包",
  })

  return typeof selected === "string" ? selected : null
}

export async function pickBackupSavePath(currentPath?: string) {
  if (!hasTauriRuntime()) {
    throw new Error("Tauri runtime unavailable")
  }

  const { save } = await import("@tauri-apps/plugin-dialog")
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
  const suggestedName = `openclaw-backup-${timestamp}.zip`

  return save({
    defaultPath: currentPath ? `${currentPath}/${suggestedName}` : suggestedName,
    filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    title: "选择备份保存位置",
  })
}

export async function inspectBackupArchive(path: string) {
  if (!hasTauriRuntime()) {
    throw new Error("Tauri runtime unavailable")
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<RestoreScanSnapshot>("inspect_backup", { path })
}

export async function preflightRestore(rootPath: string, archivePath: string) {
  if (!hasTauriRuntime()) {
    throw new Error("Tauri runtime unavailable")
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<RestorePreflightReport>("preflight_restore", {
    rootPath,
    archivePath,
  })
}

export async function restoreBackup(rootPath: string, archivePath: string, selectedKeys: string[]) {
  if (!hasTauriRuntime()) {
    throw new Error("Tauri runtime unavailable")
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<RestoreExecutionResult>("restore_backup", {
    rootPath,
    archivePath,
    selectedKeys,
  })
}
