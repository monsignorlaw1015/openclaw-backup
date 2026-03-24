import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  RefreshCcw,
  ShieldAlert,
  XCircle,
} from "lucide-react"
import { startTransition, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  exportBackup,
  getDefaultOpenClawPath,
  hasTauriRuntime,
  inspectBackupArchive,
  pickBackupArchive,
  pickOpenClawDirectory,
  preflightRestore,
  restoreBackup,
  scanOpenClaw,
} from "@/lib/desktop"
import type {
  BackupItemState,
  ExportResult,
  RestoreExecutionResult,
  RestoreOutcomeStatus,
  RestorePreflightIssue,
  RestorePreflightReport,
  RestoreScanSnapshot,
  ScanSnapshot,
} from "@/lib/app-types"
import { backupItems as backupDefinitions, backupScanState, restoreResults } from "@/lib/mock-data"

type Screen = "home" | "backup" | "backup-result" | "restore" | "restore-result"

const availabilityStyles = {
  available: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  empty: "border-amber-500/20 bg-amber-500/10 text-amber-700",
  missing: "border-zinc-300/80 bg-zinc-200/60 text-zinc-600",
} as const

const resultStyles: Record<RestoreOutcomeStatus, string> = {
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-700",
  error: "border-rose-500/20 bg-rose-500/10 text-rose-700",
}

const issueStyles = {
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-800",
  blocking: "border-rose-500/20 bg-rose-500/10 text-rose-700",
} as const

const statusCopy = {
  available: "可用",
  empty: "为空",
  missing: "缺失",
} as const

const sensitivityCopy: Record<string, string> = {
  public: "公开",
  internal: "普通",
  sensitive: "敏感",
}

function LobsterLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={[
        "lobster-logo relative flex items-center justify-center overflow-hidden rounded-[28px] border border-white/50 bg-[#080b12]",
        className,
      ].join(" ")}
    >
      <svg
        className="lobster-mark h-[78%] w-[78%]"
        fill="none"
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          className="claw-body"
          d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z"
          fill="url(#lobster-gradient)"
        />
        <path
          className="claw-left"
          d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z"
          fill="url(#lobster-gradient)"
        />
        <path
          className="claw-right"
          d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z"
          fill="url(#lobster-gradient)"
        />
        <path
          className="antenna-left"
          d="M45 15 Q35 5 30 8"
          stroke="var(--coral-bright)"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <path
          className="antenna-right"
          d="M75 15 Q85 5 90 8"
          stroke="var(--coral-bright)"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <circle className="eye" cx="45" cy="35" fill="#050810" r="6" />
        <circle className="eye" cx="75" cy="35" fill="#050810" r="6" />
        <circle className="eye-glow" cx="46" cy="34" fill="#00E5CC" r="2" />
        <circle className="eye-glow" cx="76" cy="34" fill="#00E5CC" r="2" />
        <defs>
          <linearGradient id="lobster-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="var(--logo-gradient-start)" />
            <stop offset="100%" stopColor="var(--logo-gradient-end)" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

function Card({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      className="group relative overflow-hidden rounded-[22px] border border-white/70 bg-white/90 px-5 py-5 text-left shadow-[0_14px_36px_rgba(15,23,42,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-zinc-200 hover:shadow-[0_18px_48px_rgba(15,23,42,0.1)]"
      onClick={onClick}
      type="button"
    >
      <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(15,23,42,0.02),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex h-full min-h-[148px] flex-col justify-center">
        <ChevronRight className="absolute right-0 top-0 size-5 text-zinc-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-zinc-500" />
        <div className="max-w-sm space-y-2.5">
          <h2 className="text-[24px] font-semibold leading-none tracking-[-0.04em] text-zinc-950 sm:text-[28px]">
            {title}
          </h2>
          <p className="text-sm leading-6 text-zinc-600">{description}</p>
        </div>
        <div className="mt-6 flex justify-end">
          <div className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition-colors group-hover:border-zinc-300 group-hover:text-zinc-700">
            点击进入
          </div>
        </div>
      </div>
    </button>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[24px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_56px_rgba(15,23,42,0.07)]">
      <div className="mb-4 space-y-1.5">
        <h2 className="text-[18px] font-semibold tracking-tight text-zinc-950">{title}</h2>
        {description ? <p className="text-sm leading-6 text-zinc-600">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[22px] border border-zinc-200/90 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
      <div className="mb-3 space-y-1">
        <h3 className="text-[16px] font-semibold tracking-tight text-zinc-950">{title}</h3>
        {description ? <p className="text-sm leading-6 text-zinc-600">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function CollapsibleSelectableItem({
  item,
  onToggle,
  interactionDisabled = false,
}: {
  item: BackupItemState
  onToggle: () => void
  interactionDisabled?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const disabled = interactionDisabled || item.availability !== "available"

  return (
    <div
      className={[
        "rounded-[20px] border transition-all",
        disabled ? "border-zinc-200 bg-zinc-50/80 opacity-65" : "border-zinc-200/80 bg-white",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3 px-3.5 py-3.5">
        <button
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          disabled={disabled}
          onClick={onToggle}
          type="button"
        >
          <div
            className={[
              "mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border text-[10px] font-bold",
              item.selected && !disabled
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-400",
            ].join(" ")}
          >
            {item.selected && !disabled ? "✓" : ""}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-medium text-zinc-900">{item.label}</h3>
              <span
                className={[
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  availabilityStyles[item.availability],
                ].join(" ")}
              >
                {statusCopy[item.availability]}
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-500">
                {sensitivityCopy[item.sensitivity] ?? item.sensitivity}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-zinc-500">{item.description}</p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <div className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-500">
            {item.fileCount} 个文件
          </div>
          <button
            className={[
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              interactionDisabled
                ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400"
                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
            ].join(" ")}
            disabled={interactionDisabled}
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? "收起" : "展开"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-zinc-200/80 px-3.5 py-3.5 text-sm leading-6 text-zinc-600">
          <p className="font-mono text-zinc-500">{item.path}</p>
          <p className="mt-2">{item.detail}</p>
        </div>
      ) : null}
    </div>
  )
}

function buildLockedRestoreItems(): BackupItemState[] {
  return backupDefinitions.map((item) => ({
    ...item,
    availability: "missing",
    detail: "请先选择导入包，再读取可恢复状态。",
    selected: false,
    fileCount: 0,
  }))
}

function ResultItem({
  label,
  status,
  detail,
}: {
  label: string
  status: RestoreOutcomeStatus
  detail: string
}) {
  return (
    <div className={["rounded-[20px] border px-4 py-3.5", resultStyles[status]].join(" ")}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {status === "success" ? (
          <CheckCircle2 className="size-4" />
        ) : status === "warning" ? (
          <AlertTriangle className="size-4" />
        ) : (
          <XCircle className="size-4" />
        )}
        {label}
      </div>
      <p className="mt-2 text-sm leading-6">{detail}</p>
    </div>
  )
}

function PreflightIssue({ issue }: { issue: RestorePreflightIssue }) {
  const severity = issue.severity === "blocking" ? "blocking" : "warning"
  return (
    <div className={["rounded-[18px] border px-4 py-3 text-sm leading-6", issueStyles[severity]].join(" ")}>
      <div className="font-medium">{severity === "blocking" ? "阻断项" : "风险提示"}</div>
      <p className="mt-1">{issue.message}</p>
    </div>
  )
}

export function App() {
  const desktopReady = hasTauriRuntime()
  const [screen, setScreen] = useState<Screen>("home")
  const [rootPath, setRootPath] = useState("~/.openclaw")
  const [detectedVersion, setDetectedVersion] = useState("unknown")
  const [backupItems, setBackupItems] = useState(backupScanState)
  const [restoreItems, setRestoreItems] = useState<BackupItemState[]>(buildLockedRestoreItems)
  const [restoreArchivePath, setRestoreArchivePath] = useState("")
  const [includeSensitiveData, setIncludeSensitiveData] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [hasLoadedBackupScan, setHasLoadedBackupScan] = useState(false)
  const [isPickingPath, setIsPickingPath] = useState(false)
  const [isPickingArchive, setIsPickingArchive] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [scanMessage, setScanMessage] = useState("进入导出页后会自动扫描 OpenClaw 根目录。")
  const [scanError, setScanError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)
  const [restoreMessage, setRestoreMessage] = useState("请先阅读风险提示，再选择备份包。")
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreResult, setRestoreResult] = useState<RestoreExecutionResult | null>(null)
  const [preflightReport, setPreflightReport] = useState<RestorePreflightReport | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDefaultPath() {
      try {
        const defaultPath = await getDefaultOpenClawPath()
        if (!cancelled) {
          setRootPath(defaultPath)
        }
      } catch {
        if (!cancelled) {
          setRootPath("~/.openclaw")
        }
      }
    }

    void loadDefaultPath()
    return () => {
      cancelled = true
    }
  }, [])

  const backupSelectedKeys = backupItems.filter((item) => item.selected).map((item) => item.key)
  const restoreSelectedKeys = restoreItems.filter((item) => item.selected).map((item) => item.key)
  const backupAvailableCount = backupItems.filter((item) => item.availability === "available").length
  const restoreAvailableCount = restoreItems.filter((item) => item.availability === "available").length
  const sensitiveBackupCount = backupItems.filter(
    (item) => item.availability === "available" && item.sensitivity === "sensitive"
  ).length
  const blockingIssues = preflightReport?.issues.filter((issue) => issue.severity === "blocking") ?? []
  const warningIssues = preflightReport?.issues.filter((issue) => issue.severity !== "blocking") ?? []
  const restoreNeedsSensitiveReconfig =
    !!restoreResult &&
    (!restoreResult.preflight.containsSensitiveData || restoreResult.preflight.redactedItems.length > 0)

  function applyBackupSnapshot(snapshot: ScanSnapshot) {
    startTransition(() => {
      setRootPath(snapshot.rootPath)
      setDetectedVersion(snapshot.detectedOpenclawVersion)
      setBackupItems(snapshot.items)
    })
  }

  function applyRestoreSnapshot(snapshot: RestoreScanSnapshot) {
    startTransition(() => {
      setRestoreArchivePath(snapshot.archivePath)
      setRestoreItems(snapshot.items)
    })
  }

  async function refreshBackupScan(path: string) {
    setIsScanning(true)
    setHasLoadedBackupScan(false)
    setScanError(null)
    setScanMessage("自动扫描 OpenClaw 根目录，展示可以备份导出的文件和目录。")

    try {
      const [snapshot] = await Promise.all([
        scanOpenClaw(path),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ])
      applyBackupSnapshot(snapshot)
      setHasLoadedBackupScan(true)
      setScanMessage("已完成扫描，以下为可备份导出的内容。")
    } catch (error) {
      setBackupItems(
        buildLockedRestoreItems().map((item) => ({
          ...item,
          detail: "扫描失败，请检查 OpenClaw 根目录路径是否正确。",
        }))
      )
      setHasLoadedBackupScan(true)
      setScanError(error instanceof Error ? error.message : "扫描失败")
    } finally {
      setIsScanning(false)
    }
  }

  async function refreshRestorePreflight(nextRootPath: string, nextArchivePath: string) {
    if (!desktopReady || !nextArchivePath) {
      return
    }

    try {
      const report = await preflightRestore(nextRootPath, nextArchivePath)
      setPreflightReport(report)
      setRestoreMessage(
        report.canProceed
          ? report.shouldWarn
            ? "已完成导入前检查，请先处理风险提示后再继续。"
            : "已完成导入前检查，可以继续恢复。"
          : "导入前检查未通过，请先处理阻断问题。"
      )
    } catch (error) {
      setPreflightReport(null)
      setRestoreError(error instanceof Error ? error.message : "导入前检查失败")
    }
  }

  function openBackupScreen() {
    setScreen("backup")
    void refreshBackupScan(rootPath)
  }

  function openRestoreScreen() {
    setRestoreArchivePath("")
    setPreflightReport(null)
    setRestoreItems(buildLockedRestoreItems())
    setRestoreResult(null)
    setRestoreError(null)
    setRestoreMessage("请先阅读风险提示，再选择备份包。")
    setScreen("restore")
  }

  function toggleBackupItem(key: string) {
    setBackupItems((current) =>
      current.map((item) =>
        item.key === key && item.availability === "available"
          ? { ...item, selected: !item.selected }
          : item
      )
    )
  }

  function toggleRestoreItem(key: string) {
    setRestoreItems((current) =>
      current.map((item) =>
        item.key === key && item.availability === "available"
          ? { ...item, selected: !item.selected }
          : item
      )
    )
  }

  async function handlePickRootPath(mode: "backup" | "restore") {
    if (!desktopReady) {
      const message = "浏览器预览模式不支持目录选择，请使用 `npm run tauri:dev` 启动桌面版。"
      if (mode === "backup") {
        setScanError(message)
      } else {
        setRestoreError(message)
      }
      return
    }

    setIsPickingPath(true)
    try {
      const selected = await pickOpenClawDirectory(rootPath)
      if (!selected) return
      setRootPath(selected)
      if (mode === "backup") {
        await refreshBackupScan(selected)
      } else {
        await refreshRestorePreflight(selected, restoreArchivePath)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "目录选择失败"
      if (mode === "backup") {
        setScanError(message)
      } else {
        setRestoreError(message)
      }
    } finally {
      setIsPickingPath(false)
    }
  }

  async function handleExport() {
    if (!desktopReady) {
      setExportError("浏览器预览模式不支持导出，请使用 `npm run tauri:dev` 启动桌面版。")
      return
    }

    setExportError(null)
    setExportResult(null)

    if (backupSelectedKeys.length === 0) {
      setExportError("请至少勾选 1 个可备份项。")
      return
    }

    setIsExporting(true)
    try {
      const result = await exportBackup(rootPath, backupSelectedKeys, includeSensitiveData)
      if (!result) {
        return
      }
      setExportResult(result)
      setScreen("backup-result")
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "导出失败")
    } finally {
      setIsExporting(false)
    }
  }

  async function handlePickArchive() {
    if (!desktopReady) {
      setRestoreError("浏览器预览模式不支持选择导入包，请使用 `npm run tauri:dev` 启动桌面版。")
      return
    }

    setIsPickingArchive(true)
    setRestoreError(null)
    setRestoreResult(null)
    setPreflightReport(null)

    try {
      const selected = await pickBackupArchive(restoreArchivePath)
      if (!selected) return

      const snapshot = await inspectBackupArchive(selected)
      applyRestoreSnapshot(snapshot)
      await refreshRestorePreflight(rootPath, selected)
    } catch (error) {
      setRestoreArchivePath("")
      setRestoreItems(buildLockedRestoreItems())
      setRestoreError(error instanceof Error ? error.message : "备份包读取失败")
      setRestoreMessage("无法识别当前备份包，请确认 zip 文件有效。")
    } finally {
      setIsPickingArchive(false)
    }
  }

  async function handleRestore() {
    if (!desktopReady) {
      setRestoreError("浏览器预览模式不支持执行导入，请使用 `npm run tauri:dev` 启动桌面版。")
      return
    }

    setRestoreError(null)
    setRestoreResult(null)

    if (!restoreArchivePath) {
      setRestoreError("请先选择备份包。")
      return
    }

    if (restoreSelectedKeys.length === 0) {
      setRestoreError("请至少勾选 1 个可导入项。")
      return
    }

    const report = await preflightRestore(rootPath, restoreArchivePath)
    setPreflightReport(report)
    if (!report.canProceed) {
      setRestoreMessage("导入前检查未通过，请先处理阻断问题。")
      return
    }

    const confirmed = window.confirm("恢复将覆盖当前 OpenClaw 的对应文件和目录，是否继续？")
    if (!confirmed) {
      setRestoreMessage("已取消导入。")
      return
    }

    setIsRestoring(true)
    try {
      const result = await restoreBackup(rootPath, restoreArchivePath, restoreSelectedKeys)
      setRestoreResult(result)
      const failedLabels = result.results.filter((item) => item.status === "error").map((item) => item.label)
      const warningLabels = result.results
        .filter((item) => item.status === "warning")
        .map((item) => item.label)
      setRestoreMessage(
        result.status === "success"
          ? "导入完成，所有已勾选项目都已恢复并校验通过，请手动重启 OpenClaw。"
          : [
              failedLabels.length > 0 ? `失败项：${failedLabels.join("、")}` : "",
              warningLabels.length > 0 ? `需留意：${warningLabels.join("、")}` : "",
              "请检查结果明细，并手动重启 OpenClaw。",
            ]
              .filter(Boolean)
              .join(" ")
      )
      setScreen("restore-result")
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : "导入失败")
      setRestoreMessage("导入未完成，请检查备份包、目标目录权限和预检查结果。")
    } finally {
      setIsRestoring(false)
    }
  }

  const displayedRestoreResults = useMemo(
    () => restoreResult?.results ?? restoreResults,
    [restoreResult]
  )

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.16),_transparent_22%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_20%),linear-gradient(180deg,_#fcfcfb_0%,_#f3f0ea_100%)] text-zinc-950">
      <div className="mx-auto w-full max-w-[1000px] px-3.5 py-3.5 sm:px-4 lg:px-5 lg:py-4">
        {screen === "home" ? (
          <div className="flex min-h-[calc(100svh-3.5rem)] flex-col justify-center gap-3.5">
            <div className="px-4 py-2">
              <div className="flex flex-col items-center text-center">
                <LobsterLogo className="h-24 w-24 shadow-[0_24px_46px_rgba(8,11,18,0.18)]" />
                <div className="mt-4">
                  <h1 className="text-[32px] font-semibold tracking-[-0.05em] text-zinc-950 sm:text-[38px]">
                    OpenClaw 备份助手
                  </h1>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 sm:text-[15px]">
                  一键导出 / 导入配置，重装电脑也能无缝迁移龙虾，还能复用他人配置。
                </p>
              </div>
            </div>

            <div className="mx-auto grid w-full max-w-[760px] gap-3 md:grid-cols-2">
              <Card description="一键导出，完整保存配置" onClick={openBackupScreen} title="导出备份" />
              <Card description="一键导入，快速恢复设置" onClick={openRestoreScreen} title="导入恢复" />
            </div>
          </div>
        ) : null}

        {screen === "backup" ? (
          <div className="space-y-4">
            <div>
              <Button onClick={() => setScreen("home")} size="sm" variant="outline">
                <ArrowLeft className="size-4" />
                返回
              </Button>
            </div>
            <Section description="自动扫描 OpenClaw 根目录，展示可以备份导出的文件和目录。" title="导出备份">
              <div className="mt-4 rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">当前根目录</p>
                    <p className="mt-1 truncate font-mono text-xs text-zinc-500">{rootPath}</p>
                    <p className="mt-2 text-xs text-zinc-500">OpenClaw 版本：{detectedVersion}</p>
                  </div>
                  <Button
                    className="shrink-0"
                    disabled={isPickingPath || !desktopReady}
                    onClick={() => void handlePickRootPath("backup")}
                    size="sm"
                    variant="ghost"
                  >
                    {isPickingPath ? "选择中..." : "更改路径"}
                  </Button>
                </div>
              </div>
            </Section>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.32fr)_300px]">
              <Section description={scanMessage} title="可备份内容">
                <div className="mb-4 flex items-center gap-3 rounded-[18px] border border-zinc-200 bg-zinc-50/80 px-3.5 py-2.5 text-sm text-zinc-600">
                  <RefreshCcw className="size-4" />
                  {isScanning ? "正在扫描 OpenClaw 根目录..." : `扫描完成，共发现 ${backupAvailableCount} 个可备份项。`}
                </div>
                {scanError ? <p className="mb-4 text-sm text-rose-600">{scanError}</p> : null}
                {!desktopReady ? (
                  <p className="mb-4 text-sm text-zinc-500">当前是浏览器预览模式，目录选择与真实导出需在桌面版中测试。</p>
                ) : null}
                {!hasLoadedBackupScan || isScanning ? (
                  <div className="rounded-[18px] border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-6 text-sm leading-6 text-zinc-500">
                    <div className="flex items-center gap-3">
                      <div className="size-2.5 animate-pulse rounded-full bg-zinc-400" />
                      <span>正在扫描 OpenClaw 根目录，稍后显示可备份导出的内容。</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {backupItems.map((item) => (
                      <CollapsibleSelectableItem item={item} key={item.key} onToggle={() => toggleBackupItem(item.key)} />
                    ))}
                  </div>
                )}
              </Section>

              <Panel description="确认勾选项后，在底部选择位置并导出。" title="导出操作">
                <div className="space-y-3">
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <Stat label="可用项" value={String(backupAvailableCount)} />
                    <Stat label="已勾选" value={String(backupSelectedKeys.length)} />
                    <Stat label="敏感项" value={String(sensitiveBackupCount)} />
                  </div>

                  <label className="block rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <input
                        checked={includeSensitiveData}
                        className="mt-1"
                        onChange={(event) => setIncludeSensitiveData(event.target.checked)}
                        type="checkbox"
                      />
                      <div>
                        <p className="text-sm font-medium text-zinc-900">导出敏感信息</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-600">
                          包括 API Key、Token、登录凭证和 Channel 密钥。关闭后可降低备份包泄露风险，但恢复后需要重新补配。
                        </p>
                      </div>
                    </div>
                  </label>

                  {exportError ? (
                    <div className="rounded-[18px] border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm leading-7 text-rose-700">
                      {exportError}
                    </div>
                  ) : null}

                  <Button
                    className="w-full rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
                    disabled={isExporting || backupSelectedKeys.length === 0 || !desktopReady}
                    onClick={() => void handleExport()}
                  >
                    {isExporting ? "正在导出..." : "选择位置并导出"}
                  </Button>
                </div>
              </Panel>
            </div>
          </div>
        ) : null}

        {screen === "backup-result" ? (
          <div className="space-y-4">
            <div>
              <Button onClick={() => setScreen("backup")} size="sm" variant="outline">
                <ArrowLeft className="size-4" />
                返回
              </Button>
            </div>
            <Section title="导出结果">
              {exportResult ? (
                <div className="space-y-3.5">
                  <div className="rounded-[18px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm leading-6 text-emerald-700">
                    备份包已生成完成，可以直接拿去导入恢复。
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_280px]">
                    <div className="rounded-[20px] border border-zinc-200 bg-white p-4">
                      <h3 className="text-lg font-semibold text-zinc-950">备份文件</h3>
                      <p className="mt-2.5 break-all text-sm leading-6 text-zinc-600">{exportResult.archivePath}</p>
                      <div className="mt-4 rounded-[16px] border border-zinc-200 bg-zinc-50/70 p-3.5 text-sm leading-6 text-zinc-600">
                        manifest：{exportResult.manifestPath}
                        <br />
                        OpenClaw 版本：{exportResult.openclawVersion}
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        <Stat label="导出项目" value={String(exportResult.itemCount)} />
                        <Stat label="敏感信息" value={exportResult.containsSensitiveData ? "包含" : "已排除"} />
                      </div>
                      <div className="rounded-[16px] border border-zinc-200 bg-zinc-50/70 p-3.5 text-sm leading-6 text-zinc-600">
                        包含项目：{exportResult.includedItems.join("、")}
                        {exportResult.excludedSensitiveItems.length > 0 ? (
                          <>
                            <br />
                            已排除：{exportResult.excludedSensitiveItems.join("、")}
                          </>
                        ) : null}
                        {exportResult.redactedItems.length > 0 ? (
                          <>
                            <br />
                            已脱敏：{exportResult.redactedItems.join("、")}
                          </>
                        ) : null}
                      </div>
                      {exportResult.redactedItems.length > 0 || exportResult.excludedSensitiveItems.length > 0 ? (
                        <div className="rounded-[16px] border border-amber-500/20 bg-amber-500/10 p-3.5 text-sm leading-6 text-amber-800">
                          当前备份包已做安全处理。
                          {exportResult.redactedItems.length > 0
                            ? ` ${exportResult.redactedItems.join("、")} 会保留结构但隐藏密钥字段。`
                            : ""}
                          {exportResult.excludedSensitiveItems.length > 0
                            ? ` ${exportResult.excludedSensitiveItems.join("、")} 不会包含在备份包中。`
                            : ""}
                        </div>
                      ) : null}
                      <Button
                        className="w-full rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
                        onClick={openRestoreScreen}
                      >
                        去导入恢复
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-4 py-4 text-sm leading-7 text-zinc-600">
                  暂无导出结果，请先返回导出备份页面执行导出。
                </div>
              )}
            </Section>
          </div>
        ) : null}

        {screen === "restore" ? (
          <div className="space-y-4">
            <div>
              <Button onClick={() => setScreen("home")} size="sm" variant="outline">
                <ArrowLeft className="size-4" />
                返回
              </Button>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.32fr)_300px]">
              <Section description="选择导入包后，系统会先做预检查，再展示可恢复项目。" title="导入恢复">
                <div className="mb-4 rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">目标根目录</p>
                      <p className="mt-1 truncate font-mono text-xs text-zinc-500">{rootPath}</p>
                    </div>
                    <Button
                      className="shrink-0"
                      disabled={isPickingPath || !desktopReady}
                      onClick={() => void handlePickRootPath("restore")}
                      size="sm"
                      variant="ghost"
                    >
                      {isPickingPath ? "选择中..." : "更改路径"}
                    </Button>
                  </div>
                </div>

                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <Button disabled={isPickingArchive || !desktopReady} onClick={() => void handlePickArchive()} variant="outline">
                    {isPickingArchive ? "读取备份包..." : "选择导入包"}
                  </Button>
                  <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500">
                    {restoreArchivePath ? "已选择导入包" : "未选择导入包"}
                  </div>
                </div>

                {restoreError ? <p className="mb-4 text-sm text-rose-600">{restoreError}</p> : null}
                {!desktopReady ? (
                  <p className="mb-4 text-sm text-zinc-500">当前是浏览器预览模式，选择导入包与真实导入需在桌面版中测试。</p>
                ) : null}

                {preflightReport ? (
                  <div className="mb-4 space-y-3">
                    <div className="rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-4 py-4 text-sm leading-6 text-zinc-600">
                      <p>备份包版本：{preflightReport.archiveOpenclawVersion}</p>
                      <p>目标目录版本：{preflightReport.targetOpenclawVersion}</p>
                      <p>敏感信息：{preflightReport.containsSensitiveData ? "包含" : "未包含"}</p>
                      <p>
                        脱敏项目：
                        {preflightReport.redactedItems.length > 0
                          ? preflightReport.redactedItems.join("、")
                          : "无"}
                      </p>
                      <p>OpenClaw 进程：{preflightReport.runningProcessDetected ? "疑似运行中" : "未检测到"}</p>
                    </div>
                    {preflightReport.issues.map((issue) => (
                      <PreflightIssue issue={issue} key={`${issue.code}-${issue.message}`} />
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-4">
                  {restoreItems.map((item) => (
                    <CollapsibleSelectableItem
                      interactionDisabled={!restoreArchivePath}
                      item={item}
                      key={item.key}
                      onToggle={() => toggleRestoreItem(item.key)}
                    />
                  ))}
                </div>
              </Section>

              <Panel description="确认导入项后，点击底部按钮执行导入。" title="确认导入">
                <div className="space-y-3">
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <Stat label="可导入项" value={String(restoreAvailableCount)} />
                    <Stat label="已勾选" value={String(restoreSelectedKeys.length)} />
                    <Stat
                      label="预检查"
                      value={
                        !preflightReport
                          ? "未开始"
                          : blockingIssues.length > 0
                            ? "阻断"
                            : warningIssues.length > 0
                              ? "告警"
                              : "通过"
                      }
                    />
                  </div>

                  <div className="rounded-[18px] border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm leading-7 text-amber-800">
                    <div className="flex items-center gap-2 font-medium">
                      <ShieldAlert className="size-4" />
                      导入风险提示
                    </div>
                    <p className="mt-2">
                      导入会覆盖当前 OpenClaw 的对应文件和目录。若备份包排除了敏感信息，恢复后仍需手动补填 API Key、Token 和登录凭证。
                    </p>
                  </div>

                  <Button
                    className="w-full rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
                    disabled={
                      isRestoring ||
                      restoreSelectedKeys.length === 0 ||
                      !restoreArchivePath ||
                      !desktopReady ||
                      Boolean(preflightReport && !preflightReport.canProceed)
                    }
                    onClick={() => void handleRestore()}
                  >
                    {isRestoring ? "正在导入..." : "确认导入"}
                  </Button>
                </div>
              </Panel>
            </div>
          </div>
        ) : null}

        {screen === "restore-result" ? (
          <div className="space-y-4">
            <div>
              <Button onClick={() => setScreen("restore")} size="sm" variant="outline">
                <ArrowLeft className="size-4" />
                返回
              </Button>
            </div>

            <Section title="导入结果">
              {restoreResult ? (
                <div className="space-y-3.5">
                  <div
                    className={[
                      "rounded-[18px] border px-4 py-4 text-sm leading-6",
                      resultStyles[restoreResult.status],
                    ].join(" ")}
                  >
                    <p>{restoreMessage}</p>
                    <div className="mt-2 space-y-1 text-xs leading-6 opacity-80">
                      <p>备份包：{restoreResult.archivePath}</p>
                      <p>成功项：{restoreResult.restoredCount}</p>
                      <p>失败项：{restoreResult.failedCount}</p>
                      <p>预检查：{restoreResult.preflight.canProceed ? "已通过" : "未通过"}</p>
                    </div>
                  </div>

                  {restoreNeedsSensitiveReconfig ? (
                    <div className="rounded-[18px] border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-800">
                      {restoreResult.preflight.redactedItems.length > 0
                        ? `以下项目已脱敏：${restoreResult.preflight.redactedItems.join("、")}。`
                        : ""}
                      {!restoreResult.preflight.containsSensitiveData
                        ? " 当前备份包不包含敏感信息，请在 OpenClaw 中重新补填 API Key、Token 和其他登录凭证。"
                        : " 请在 OpenClaw 中检查并补齐被隐藏的密钥字段。"}
                    </div>
                  ) : null}

                  <div className="space-y-2.5">
                    {displayedRestoreResults.map((result) => (
                      <ResultItem detail={result.detail} key={result.label} label={result.label} status={result.status} />
                    ))}
                  </div>

                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <Button className="rounded-full bg-zinc-950 text-white hover:bg-zinc-800" onClick={() => setScreen("home")}>
                      返回首页
                    </Button>
                    <Button onClick={() => setScreen("restore")} variant="outline">
                      返回导入页
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-4 py-4 text-sm leading-7 text-zinc-600">
                  暂无导入结果，请先返回导入恢复页面执行导入。
                </div>
              )}
            </Section>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-zinc-200 bg-white px-3.5 py-3">
      <p className="whitespace-nowrap text-xs uppercase tracking-[0.06em] text-zinc-400">{label}</p>
      <p className="mt-1.5 text-[20px] font-semibold tracking-tight text-zinc-950">{value}</p>
    </div>
  )
}

export default App
