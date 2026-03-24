# Release Checklist

## 准备发布

1. 确认版本号一致
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

2. 运行基础检查

```bash
npm run build
cd src-tauri && cargo test && cargo check
```

3. 构建 macOS dmg

```bash
npx tauri build --bundles dmg
```

4. 检查产物

```bash
src-tauri/target/release/bundle/dmg/OpenClaw 备份助手_0.1.1_aarch64.dmg
```

## 发布到 GitHub Releases

建议将 `.dmg` 作为 Release Asset 上传，不要直接提交到 Git 仓库。

推荐在 Release 文案中说明：

- 当前版本主要支持 macOS
- 首次打开若被拦截，需要右键打开或在系统设置中放行
- 导入前建议关闭 OpenClaw
- 如果导出时排除了敏感信息，恢复后需要重新填写 API Key / Token / Secret

## 建议的 Release 标题

```text
v0.1.1 - 文档与展示完善
```

## 建议的 Release 描述

```text
OpenClaw 备份助手首个可用版本，聚焦 macOS 本地迁移场景。

本版本支持：
- 扫描真实 OpenClaw 根目录
- 导出 zip 备份包
- 导入前预检查
- 覆盖式恢复
- 敏感信息排除与主配置脱敏导出
- 恢复结果与风险提示

适用场景：
- 换电脑迁移
- 重装系统前备份
- 本地 OpenClaw 配置恢复

注意：
- 当前版本面向 macOS
- 首次打开可能需要手动放行
- 如果备份包未包含敏感信息，恢复后仍需重新填写 API Key / Token
```
