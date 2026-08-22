# PIP Loader：可演进加载器

[← 上一篇：PIP Seed](seed.md) · [RelationNode 插件架构](../relation_node_plugins.md)

## 定位

Loader 是由 Seed 启动的可演进加载器，本身以 `.pip` 形式存在。`N` 表示加载器可以持续发布新版本，而无需扩大或频繁替换原生种皮。

```text
Seed
→ a1_loader_{major}_{minor}_{patch}_{YYYYMMDD}.pip
→ 选择并启动一个 a2 通用节点编辑器
```

Loader 合并系统与用户 Catalog，但顶层只展示有效的 `a2`。一个窗口只运行
一个主编辑器；用户可通过 Runtime Profile、`--editor` 或选择界面使用不同
类型和版本的 a2。明确指定的编辑器无效时停留在选择界面，不静默回退。

## 核心职责

- 选择本地 a2 编辑器；
- 维护最近打开、收藏和恢复入口；
- 获取本地或远端 PIP；
- 处理 PIP 版本兼容和迁移提示；
- 提供更新、回滚和错误恢复体验；
- 请求并呈现运行所需权限；
- 选择合适的运行入口或环境；
- 调用 Seed 提供的底层加载能力。

## 明确不负责

- 不重新实现 PIP 原生解析和可信启动根；
- 不承担通用节点编辑；
- 不内置 Software Authoring 或交易所业务；
- 不要求用户使用系统默认 Intent Map，允许选择其他兼容 a2；
- 不把 Agent 作为加载器成立的前提。

## 状态边界

与无状态 Seed 不同，Loader 可以管理用户体验状态，例如：

- 最近打开的 PIP；
- 下载与更新进度；
- 用户确认过的权限；
- 恢复和回滚选择；
- 加载失败诊断。

这些状态应属于 Loader 自己的应用数据，不写回 Seed，也不污染被加载 PIP 的业务数据。

## 与 Intent Map 的边界

Loader 负责“找到并启动主编辑器”；a2 负责“编辑节点应用”。

```text
Loader：使用哪个 a2、如何启动
a2 Editor：这个 .pip 的节点如何查看和编辑
```

Intent Map 可以由 Loader 启动，但 Loader 也应能够启动不依赖 Intent Map 的其他 `.pip`。

## 实现映射

后续建议将以下能力归入独立 Loader PIP：

- 文件选择器和最近项目界面；
- 包下载、更新和版本选择；
- 权限确认和错误恢复 UI；
- PIP 启动入口注册；
- 对 Seed 能力的调用适配。

当前 Seed 为 Loader 暴露 `GET /__pip/catalog` 与 `POST /__pip/activate`。
激活请求使用 catalog 返回的完整文件名；宿主会拒绝路径逃逸、错误层级、
未登记文件、非 a2 包、未信任的用户 SHA 以及激活前重新校验失败的包。

原生宿主只暴露必要能力，具体加载流程和 UI 尽量在 Loader 中实现。

## 验收条件

- Seed 能将 Loader 当作普通 `.pip` 启动；
- Loader 可以选择并启动系统或用户安装的 a2；
- Loader 可以独立升级和回滚；
- 用户状态不会要求修改 Seed；
- 加载失败时可以恢复或选择其他版本；
- Loader 的更新不改变目标 PIP 的内容。

---

[← 上一篇：PIP Seed](seed.md) · [RelationNode 插件架构](../relation_node_plugins.md)
