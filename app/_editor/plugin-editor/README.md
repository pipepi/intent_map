# Three-layer RelationNode plugins

所有包只接受 `schemaVersion: 2`，V1 包直接拒绝。

- Element ZIP：`manifest.json`、自包含 `entry.mjs` 与披露源码。模块在浏览器主窗口注册 manifest 声明的 Web Component。
- Node Type ZIP：`manifest.json`、`ontology.json`、自包含 `entry.mjs` 与披露源码。默认导出注册函数，可注册类型、校验、命令、执行器、投影与语言 provider。
- Collection ZIP：`manifest.json`、`graph.json`、`workspace.json` 以及可再分发的精确依赖。它是纯数据包，不执行代码。

元素通过 DOM `context` property 接收 RelationGraph 快照，并用 bubbling、composed 的 `intent-relation-request` 事件请求补丁、选择或命令。宿主对所有请求重新校验。

元素和节点类型模块都使用 Blob URL 动态 import，在主窗口同权运行；编码和导入时使用 ESM lexer 拒绝静态 import、动态 import 与 re-export source，`import.meta` 可以使用。这是单文件 ABI 的结构校验，不是安全沙箱；通过运行时生成代码仍可能绕过静态分析。禁用会撤销解析和 ABI 注册，但 Web Component 与已经产生的模块副作用只能通过刷新彻底清除。

集合安装只验证并加入目录，不执行内嵌插件。目录以 `id@version + contentSha256` 维护不可变身份：相同内容重复安装幂等，同版本不同内容拒绝，不同版本可以并存。内容摘要规范化 ZIP 结构和协议 JSON，同时覆盖 graph、workspace 与内嵌依赖。打开集合会先复制图和视图状态创建独立 workspace，再尝试按 Element、Node Type 顺序激活内嵌依赖；任何缺失、冲突或执行错误都会成为 workspace capability diagnostic，原始关系仍可读取。删除包不会删除已有 workspace。

可执行 registry 按插件 ID 合并并发安装，避免重复执行模块。节点类型实际注册的 type ref 必须与 manifest `typeNodeIds` 对应的 identity ref 完全一致。禁用或安装回滚会尝试全部宿主 release；即使插件自己的 disposer 抛错，类型、命令、执行器、投影和语言 provider 也必须停止解析。
