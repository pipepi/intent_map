# Runtime Profile：多编辑器、多能力与用户版本

[← Loader N](loader_n.md) · [Intent Map](intent_map.md) · [Software Authoring](software_authoring.md) · [返回总体方案](../intent_map_position.md)

## 定位

系统默认仓库由本项目 Git 跟踪，只包含官方 a0–a3。用户 Registry 位于平台
应用数据目录，可以安装 a0–a5；全部 a4/a5 和用户自定义 a0–a3 都属于用户数据。

```text
a0 native → 一个 a1 → 一个主 a2；可选 a3 workspace 在外层组合扩展
```

## 精确选择

Runtime Profile 使用 `origin + packageId + version + releaseDate + sha256` 引用包，
精确选择 Loader、Editor 和每个能力的主提供者。解析优先级为命令行、Profile、
工作区最近选择、系统默认。显式选择无效时报告错误，不静默降级。

- `--profile <id>`：读取用户 `profiles/<id>.json`；
- `--pip <file>`：覆盖 a1；
- `--editor <file>`：覆盖 a2；
- `--select-editor`：强制显示 a2 列表。

## 编辑器与能力

a2 通过 `pip-editor/1` 声明编辑器类型与支持的文档类型。一个窗口只运行一个
主 a2；不兼容目标文档时可以保存并用另一 a2 新开窗口。

a3 由独立于 a2 的 workspace host 通过 `pip-capability/1` 在 Worker 中运行。
Profile 中的用户提供者优先，
系统默认只补齐未指定能力。同一 ABI 不自动选择最高版本，也不同时组合多个主
提供者。Worker 只返回声明式命令、诊断和文档补丁，不能直接注入 React 或访问
文件系统。

## 安全边界

`open` 只解析 Manifest、内树和资产，不执行目标 Loader。`install`、`trust`、
`activate` 和 `run-preview` 是不同操作。用户 a1/a2/a3 首次执行需要按内容 SHA
授权；内容变化后授权失效。a0 每个版本构建成独立 `.app/.exe`，不引入 a-1。

## 存储与分发

```text
packages/system/       官方 a0–a3 权威 PIP
用户数据/registry/     用户 a0–a5
用户数据/profiles/     Runtime Profile
用户数据/workspaces/   用户项目与 a4/a5
dist/pip-runtime/pip/  当前官方发行选择的系统包副本
```

官方分发不包含 a4/a5 或用户版本。用户可以自行用独立 Git、同步盘或备份工具管理
Registry 和 Workspace。

---

[← Loader N](loader_n.md) · [Intent Map](intent_map.md) · [Software Authoring](software_authoring.md) · [返回总体方案](../intent_map_position.md)
