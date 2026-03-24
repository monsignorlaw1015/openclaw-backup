import type { ActivityLog, BackupItem, BackupItemState, RestoreResult } from "@/lib/app-types"

export const backupItems: BackupItem[] = [
  {
    key: "config",
    label: "主配置",
    path: "openclaw.json",
    description: "OpenClaw 主配置，包含模型、命令、Channel、Gateway 等设置。",
    category: "configuration",
    sensitivity: "internal",
  },
  {
    key: "authProfiles",
    label: "认证配置",
    path: "agents/main/agent/auth-profiles.json",
    description: "Provider API Key、OAuth Token 与默认认证配置。",
    category: "security",
    sensitivity: "sensitive",
  },
  {
    key: "identity",
    label: "设备身份",
    path: "identity/",
    description: "设备配对、登录态与本机身份信息。",
    category: "security",
    sensitivity: "sensitive",
  },
  {
    key: "memory",
    label: "记忆",
    path: "memory/",
    description: "长期记忆与个性化上下文数据。",
    category: "data",
    sensitivity: "internal",
  },
  {
    key: "skills",
    label: "技能",
    path: "skills/",
    description: "已安装技能与本地扩展能力。",
    category: "customization",
    sensitivity: "internal",
  },
  {
    key: "workspace",
    label: "工作区",
    path: "workspace/",
    description: "项目工作区与关联上下文。",
    category: "data",
    sensitivity: "internal",
  },
  {
    key: "agents",
    label: "Agent 模型配置",
    path: "agents/main/agent/models.json",
    description: "Agent 运行模型与默认行为配置。",
    category: "customization",
    sensitivity: "internal",
  },
  {
    key: "sessions",
    label: "对话历史",
    path: "agents/main/sessions/",
    description: "历史会话、上下文与迁移后最容易丢失的记录。",
    category: "data",
    sensitivity: "internal",
  },
  {
    key: "extensions",
    label: "插件扩展",
    path: "extensions/",
    description: "已安装插件、扩展技能与第三方接入能力。",
    category: "integration",
    sensitivity: "internal",
  },
  {
    key: "jobs",
    label: "定时任务",
    path: "cron/jobs.json",
    description: "本地 cron 任务与自动化作业配置。",
    category: "integration",
    sensitivity: "internal",
  },
]

export const backupScanState: BackupItemState[] = [
  {
    ...backupItems[0],
    availability: "available",
    detail: "已识别主配置文件。",
    selected: true,
    fileCount: 1,
  },
  {
    ...backupItems[1],
    availability: "available",
    detail: "检测到认证配置文件，包含 API Key 与 OAuth Token。",
    selected: true,
    fileCount: 1,
  },
  {
    ...backupItems[2],
    availability: "available",
    detail: "检测到 2 个设备身份文件。",
    selected: true,
    fileCount: 2,
  },
  {
    ...backupItems[3],
    availability: "available",
    detail: "记忆目录存在，共 248 条记录。",
    selected: true,
    fileCount: 248,
  },
  {
    ...backupItems[4],
    availability: "empty",
    detail: "目录存在，但当前为空，导出时不可选。",
    selected: false,
    fileCount: 0,
  },
  {
    ...backupItems[5],
    availability: "available",
    detail: "工作区历史已识别，体积约 32 MB。",
    selected: true,
    fileCount: 48,
  },
  {
    ...backupItems[6],
    availability: "available",
    detail: "检测到 Agent 模型配置文件。",
    selected: true,
    fileCount: 1,
  },
  {
    ...backupItems[7],
    availability: "available",
    detail: "检测到 120 个历史会话文件。",
    selected: true,
    fileCount: 120,
  },
  {
    ...backupItems[8],
    availability: "available",
    detail: "检测到 4 个插件扩展目录。",
    selected: true,
    fileCount: 4,
  },
  {
    ...backupItems[9],
    availability: "available",
    detail: "检测到本地 cron 作业配置文件。",
    selected: true,
    fileCount: 1,
  },
]

export const restoreResults: RestoreResult[] = [
  {
    label: "主配置",
    status: "success",
    detail: "已完成覆盖写入。",
  },
  {
    label: "凭证",
    status: "warning",
    detail: "当前备份包未包含敏感信息，恢复后需要重新填写 API Key。",
  },
  {
    label: "对话历史",
    status: "success",
    detail: "历史会话已完整恢复。",
  },
]

export const recentActivity: ActivityLog[] = [
  {
    time: "11:42",
    title: "扫描默认目录",
    detail: "已读取 ~/.openclaw 并识别到 9 个可备份项。",
  },
  {
    time: "11:45",
    title: "生成备份包",
    detail: "openclaw-backup-20260323-114512.zip 已写入桌面。",
  },
  {
    time: "11:58",
    title: "恢复完成",
    detail: "本次恢复为部分成功，请手动重启 OpenClaw。",
  },
]
