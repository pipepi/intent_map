# Intent Map：总体方案与文档导航

[← 返回项目 README](../README.md)

[a2/a3 Workspace Refactor 执行台账](a2_a3_workspace_execution.md)

## 总体定位

Intent Map 是系统默认提供的业务无关分形节点编辑器。a2 是可扩展的通用编辑器
类别，Intent Map 只是默认实现；a3 是可组合的业务无关能力类别。

整个体系拆分为五个可以分别实现和演进的部分：

| 顺序 | 子系统 | 定位 | 详细文档 |
|---|---|---|---|
| 1 | Loader 0 | 唯一原生、无状态且稳定的初始加载器（种皮） | [loader_0.md](intent_map_module/loader_0.md) |
| 2 | Loader N | 由 `.pip` 承载、可以持续升级的加载器 | [loader_n.md](intent_map_module/loader_n.md) |
| 3 | a2 Editors | Intent Map 等可替代通用节点编辑器 | [intent_map.md](intent_map_module/intent_map.md) |
| 4 | a3 Capabilities | Software Authoring 等可组合业务无关能力 | [software_authoring.md](intent_map_module/software_authoring.md) |
| 5 | Crypto CEX | 验证 Software Authoring 的真实交易所案例 | [crypto_cex.md](intent_map_module/crypto_cex.md) |

## 系统关系

```text
loader_0（a0 原生种皮）
        ↓ 加载
a1 Loader（选择一个主 a2）
        ↓
一个 a2 Editor（Intent Map 或其他通用编辑器）
        ↓ 组合
零到多个 a3 Capability（Software Authoring 等）
        ↓ 应用于
用户 a4/a5 PIP
```

架构层级固定为 `a0` Seed、`a1` Loader、`a2` Editor、`a3` Functional、
`a4` Business、`a5` Other。PIP 文件统一命名为
`{layer}_{name}_{major}_{minor}_{patch}_{YYYYMMDD}.pip`；原生 Seed 使用
相同结构但不带 `.pip` 扩展名（Windows 为 `.exe`）。

五个部分彼此分层，但不构成领域耦合：

- Loader 0 不认识任何业务，只负责验证和启动 `.pip`；
- Loader N 负责可演进的加载体验，不承担节点编辑；
- Intent Map 不认识软件开发、交易所或 Agent；
- Software Authoring 是一种可选节点应用，不是编辑器内核；
- Crypto CEX 是 Software Authoring 的案例，不是通用能力的一部分；
- 人、Agent、脚本和其他工具都是可选操作者。

系统默认 a0–a3 由本仓库跟踪；用户自定义 a0–a3 和全部 a4/a5 位于用户
Registry/Workspace。精确版本、一个主 a2 与多个 a3 由
[Runtime Profile](intent_map_module/pip_runtime_profiles.md) 选择。

## `.pip` 统一范式

`.pip` 是统一的可运行、可编辑、可组合和可分发单元，可以承载节点结构、应用逻辑、代码、资源、配置和继续创作所需的上下文。

系统具有递归与自举关系：

```text
Loader 0 运行 .pip
.pip 可以是 Loader N
Loader N 打开 .pip
.pip 可以是 Intent Map
Intent Map 编辑 .pip
.pip 可以继续生成、组合和分发其他 .pip
```

核心原则是：

> Loader 0 负责启动，`.pip` 负责一切演进。

## 实现代码的文档归属

后续代码应按职责对应到五份子文档。新增代码前，先判断它属于哪个边界：

```text
原生启动、包验证、最小 WebView        → loader_0
文件选择、更新、恢复、加载体验          → loader_n
通用节点、画布、端口、作用域、编辑历史  → intent_map
内树、外树、八层披露、MCP 协作         → software_authoring
交易所业务流、约束及其各层实现案例      → crypto_cex
```

如果一段代码同时跨越多个边界，应优先通过明确接口拆分，而不是让上层业务概念进入下层。

## 共同产品原则

1. Loader 0 极小、无状态并保持稳定。
2. Loader N、Intent Map、能力包和案例均以 `.pip` 独立演进。
3. Intent Map 保持业务无关。
4. `.pip` 可以递归加载、编辑、组合和分发。
5. 软件开发只是 Intent Map 的一个应用方向。
6. Crypto CEX 是实际验证案例，不反向限定通用能力。
7. 人工、团队、Agent、脚本和外部工具可以自由切换。
8. Agent 与 MCP 是可选能力，不是系统成立的前提。

## 建议验证顺序

1. Loader 0 能稳定验证并启动一个最小 `.pip`；
2. Loader 0 能启动 Loader N；
3. Loader N 能打开 Intent Map；
4. Intent Map 能创建、编辑、运行和导出另一个 `.pip`；
5. Software Authoring 能提供内树、可选外树和逐层披露；
6. Crypto CEX 能证明复杂业务可以在合适颗粒度上被掌控；
7. 人工和可选 Agent 都能局部填充并相互接管。

## 子文档导航

- [Loader 0：无状态初始加载器](intent_map_module/loader_0.md)
- [Loader N：可演进加载器](intent_map_module/loader_n.md)
- [Intent Map：通用分形节点编辑器](intent_map_module/intent_map.md)
- [Software Authoring：软件开发复杂度掌控](intent_map_module/software_authoring.md)
- [Crypto CEX：实际应用案例](intent_map_module/crypto_cex.md)
- [Runtime Profile：多编辑器、多能力与用户版本](intent_map_module/pip_runtime_profiles.md)

---

[← 返回项目 README](../README.md)
