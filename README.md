# Relation Map

Relation Map 是以 `RelationNode` 为唯一事实模型的关系世界编辑器。节点是递归关系集合；入关系、依赖边、事件连线与层级视图均由索引或插件动态推导，不持久化第二份边数据。

空白应用只包含关系内核、原子补丁、包管理和通用工作区宿主。Intent 与 Scene 不属于核心，也不会被默认发现或安装；它们在 `plugins/` 下以三个手动安装的 V2 包交付：

- 元素插件：主窗口 Web Component，可视化、交互与编辑。
- 节点类型插件：主窗口单文件 ESM，注册类型、校验、命令、执行器、投影器和语言 provider。
- 节点集合插件：不执行代码，提供 RelationGraph、视图状态及精确依赖。

可执行插件与宿主拥有相同浏览器权限。哈希用于完整性检查，不代表沙箱或信任授权；禁用会撤销宿主注册项，已执行代码需要刷新才能完全清除。

## 开发

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
npm run build
npm test
```

访问 `/` 可打开空白通用宿主。生成可手动安装的 Intent/Scene 三层插件包：

```bash
npm run plugins:relation:build
```

产物写入 `dist/relation-plugins/`。完整架构与包契约见 [三层 RelationNode 插件架构](doc/relation_node_plugins.md)，浏览器验收步骤见 [three-layer-browser-checklist.md](tests/three-layer-browser-checklist.md)。

## PIP 与自托管

系统维护 A0 Seed、A1 Loader 和 A2 Relation Map 三个核心 PIP。常用命令：

- `npm run pip:system`：重建 Git 跟踪的 A0–A2 PIP。
- `npm run pip:self:audit`：审计 PIP 内源码与仓库边界。
- `npm run pip:self:extract -- <directory>`：提取可重建源码。
- `npm run pip:self:seal -- <directory>`：封存修改后的候选源码。
- `npm run pip:self:build -- <source> <candidates>`：构建 A0–A2 候选及 receipt。
- `npm run pip:promote-system -- <candidates> <package-id> --allow-package-limits`：显式晋升候选。

PIP 容量、资源数与压缩比限制仍由显式 I/O policy 管理，详见 [PIP self-hosting](doc/intent_map_module/pip_self_hosting.md)。
