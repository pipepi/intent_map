# Loader N：可演进加载器

[← 上一篇：Loader 0](loader_0.md) · [返回总体方案](../intent_map_position.md) · [下一篇：Intent Map →](intent_map.md)

## 定位

Loader N 是由 Loader 0 启动的可演进加载器，本身以 `.pip` 形式存在。`N` 表示加载器可以持续发布新版本，而无需扩大或频繁替换原生种皮。

```text
Loader 0
→ loader_n.pip
→ 选择、获取并启动目标 .pip
```

## 核心职责

- 选择本地 `.pip`；
- 维护最近打开、收藏和恢复入口；
- 获取本地或远端 PIP；
- 处理 PIP 版本兼容和迁移提示；
- 提供更新、回滚和错误恢复体验；
- 请求并呈现运行所需权限；
- 选择合适的运行入口或环境；
- 调用 Loader 0 提供的底层加载能力。

## 明确不负责

- 不重新实现 PIP 原生解析和可信启动根；
- 不承担通用节点编辑；
- 不内置 Software Authoring 或交易所业务；
- 不要求用户使用 Intent Map 才能运行其他 PIP；
- 不把 Agent 作为加载器成立的前提。

## 状态边界

与无状态 Loader 0 不同，Loader N 可以管理用户体验状态，例如：

- 最近打开的 PIP；
- 下载与更新进度；
- 用户确认过的权限；
- 恢复和回滚选择；
- 加载失败诊断。

这些状态应属于 Loader N 自己的应用数据，不写回 Loader 0，也不污染被加载 PIP 的业务数据。

## 与 Intent Map 的边界

Loader N 负责“找到并启动应用”；[Intent Map](intent_map.md) 负责“编辑节点应用”。

```text
Loader N：打开哪个 .pip、如何启动
Intent Map：这个 .pip 的节点如何查看和编辑
```

Intent Map 可以由 Loader N 启动，但 Loader N 也应能够启动不依赖 Intent Map 的其他 `.pip`。

## 实现映射

后续建议将以下能力归入独立 Loader N PIP：

- 文件选择器和最近项目界面；
- 包下载、更新和版本选择；
- 权限确认和错误恢复 UI；
- PIP 启动入口注册；
- 对 Loader 0 能力的调用适配。

原生宿主只暴露必要能力，具体加载流程和 UI 尽量在 Loader N 中实现。

## 验收条件

- Loader 0 能将 Loader N 当作普通 `.pip` 启动；
- Loader N 可以打开 Intent Map 和其他 PIP；
- Loader N 可以独立升级和回滚；
- 用户状态不会要求修改 Loader 0；
- 加载失败时可以恢复或选择其他版本；
- Loader N 的更新不改变目标 PIP 的内容。

---

[← 上一篇：Loader 0](loader_0.md) · [返回总体方案](../intent_map_position.md) · [下一篇：Intent Map →](intent_map.md)
