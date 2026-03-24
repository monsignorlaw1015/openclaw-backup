export type BackupItemKey = string

export type ScanAvailability = "available" | "empty" | "missing"

export type RestoreOutcomeStatus = "success" | "warning" | "error"

export type BackupItemCategory =
  | "configuration"
  | "security"
  | "data"
  | "customization"
  | "integration"
  | string

export type BackupItemSensitivity = "public" | "internal" | "sensitive" | string

export interface BackupItem {
  key: BackupItemKey
  label: string
  path: string
  description: string
  category: BackupItemCategory
  sensitivity: BackupItemSensitivity
}

export interface BackupItemState extends BackupItem {
  availability: ScanAvailability
  detail: string
  selected: boolean
  fileCount: number
}

export interface RestoreResult {
  label: string
  status: RestoreOutcomeStatus
  detail: string
}

export interface ActivityLog {
  time: string
  title: string
  detail: string
}

export interface ScanSnapshot {
  rootPath: string
  detectedOpenclawVersion: string
  availableItemCount: number
  items: BackupItemState[]
}

export interface ExportResult {
  archivePath: string
  manifestPath: string
  includedItems: string[]
  excludedSensitiveItems: string[]
  redactedItems: string[]
  itemCount: number
  containsSensitiveData: boolean
  openclawVersion: string
}

export interface RestorePreflightIssue {
  severity: "warning" | "blocking" | string
  code: string
  message: string
}

export interface RestorePreflightReport {
  rootPath: string
  archivePath: string
  targetOpenclawVersion: string
  archiveOpenclawVersion: string
  containsSensitiveData: boolean
  redactedItems: string[]
  runningProcessDetected: boolean
  canProceed: boolean
  shouldWarn: boolean
  issues: RestorePreflightIssue[]
}

export interface RestoreScanSnapshot {
  archivePath: string
  detectedOpenclawVersion: string
  containsSensitiveData: boolean
  redactedItems: string[]
  manifestMissing: boolean
  items: BackupItemState[]
}

export interface RestoreExecutionResult {
  archivePath: string
  restoredCount: number
  failedCount: number
  status: RestoreOutcomeStatus
  preflight: RestorePreflightReport
  results: RestoreResult[]
}
