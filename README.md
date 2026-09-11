# Pip Map

Pip Map 是以 `Pip` 为唯一事实模型的关系世界编辑器。文档、图、节点与关系分别由 `PipForkLevel.DOCUMENT / GRAPH / NODE / PIPE` 区分，共用 `id`、`fork_level`、可选成对的 `predicate_value` 和递归 `pips`。入关系、节点字典、依赖边与层级视图均由索引或插件动态推导，不持久化第二份事实。

图 revision、文档根节点与工作区状态由元数据 PIPE 承载。文档写出为 `pip-workspace@3`；旧 v1/v2 文档在读取边界迁移为统一 Pip。

空白应用只包含关系内核、原子补丁、PIP 管理和通用工作区宿主。浏览器入口位于 `pip-editor/web/`；Intent 与 Scene 位于 `pip-editor-io/`，不会被核心自动安装。系统只交换 `.pip`：

PIP 的分离工作区、外部资源索引及流式 Bundle/Unbundle 也属于编辑器通用 I/O，分别位于 `pip-editor/pip-package/workspace/` 与 `pip-editor/pip-package/bundle/`，不再使用含义模糊的根级 `a3/` 目录。

- A3 Node Element Plugin：Web Component 表现、交互与编辑。
- A4 Node Type Plugin：类型、校验、命令、执行器、投影器和语言 provider。
- A5 Node Map：不执行代码，提供 PipGraph、视图状态及精确 A4 依赖；portable 形式扁平携带依赖 PIP。

可执行插件与宿主拥有相同浏览器权限。哈希用于完整性检查，不代表沙箱或信任授权；禁用会撤销宿主注册项，已执行代码需要刷新才能完全清除。

## 开发

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
npm run build
npm test
```

`npm run dev` 默认在 `http://127.0.0.1:3000` 提供自动刷新的空白通用宿主。生成 Intent/Scene 的 A3–A5 PIP：

```bash
npm run plugins:pip:build
```

产物写入 `dist/pip-editor-io/`。工程目录、处理链与状态边界见
[工程目录与处理机制](doc/project_structure.md)，包契约见
[A3–A5 PipNode PIP 架构](doc/pip_node_plugins.md)。

## PIP 与自托管

系统统一维护 A0 Seed、A1 Loader、A2 Editor、A3 Node Element、A4 Node Type、A5 Node Map 六层协议。常用命令：

根目录按处理机制命名：`pip-seed/` 负责自举，`pip-editor/` 负责通用编辑与
PIP I/O，`pip-editor-io/` 保存可独立构建和安装的领域 A3–A5 插件套件；
随 A2 编译发布的宿主特权插件位于 `pip-editor/pip-host-io/`。

- `npm run pip:system`：重建 Git 跟踪的 A0–A2 PIP。
- `npm run pip:self:audit`：审计 PIP 内源码与仓库边界。
- `npm run pip:self:extract -- <directory>`：提取可重建源码。
- `npm run pip:self:seal -- <directory>`：封存修改后的候选源码。
- `npm run pip:self:build -- <source> <candidates>`：构建 A0–A2 候选及 receipt。
- `npm run pip:promote-system -- <candidates> <package-id> --allow-package-limits`：显式晋升候选。

PIP 容量、资源数与压缩比限制仍由显式 I/O policy 管理，详见 [PIP self-hosting](doc/pip-seed/self-hosting.md)。
