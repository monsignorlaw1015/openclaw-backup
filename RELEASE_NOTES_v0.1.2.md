# OpenClaw 备份助手 v0.1.2

这个版本主要是一次展示层和文案层的小更新，让下载页、README 和应用首页更加统一。

## 更新内容

- 首页标题统一为 `OpenClaw 备份助手`
- 首页描述更新为：
  `一键导出 / 导入配置，重装电脑也能无缝迁移龙虾，还能复用他人配置。`
- README 预览图替换为最新首页截图

## 当前能力

- 扫描真实 OpenClaw 根目录
- 导出 zip 备份包
- 导入前预检查
- 覆盖式恢复
- 敏感信息排除与主配置脱敏导出
- 恢复结果与风险提示

## 注意事项

- 当前版本主要支持 macOS
- 从 GitHub 下载并安装到 `Applications` 后，如果首次打开被系统拦截，请先在终端执行：

```bash
xattr -rd com.apple.quarantine "/Applications/OpenClaw 备份助手.app"
open "/Applications/OpenClaw 备份助手.app"
```

- 如果执行完命令后仍被拦截，再尝试右键应用并选择“打开”
- 导入前建议先关闭 OpenClaw
- 如果备份包未包含敏感信息，恢复后仍需重新填写 API Key、Token、Secret
