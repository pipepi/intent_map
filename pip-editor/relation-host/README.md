# A3–A5 Relation host

```text
.pip → policy/section/hash/closure validation → one trust confirmation
     → A3 Element registry → A4 Node Type registry → A5 workspace
     → RelationPatch → RelationGraph → projection → view
```

- `contracts/` 定义宿主 ABI；包身份直接使用分层 `PipManifest`。
- `packages/` 处理统一 PIP、完整依赖闭包、导入导出与内容信任，不再存在 ZIP 协议。
- `activation/` 只维护 A3、A4 的运行 registry；A5 是纯数据。
- `workspace/` 原子提交 Patch 并维护 undo/redo。
- `projection/` 从 RelationGraph 纯计算展示数据。
- `relation-host.tsx` 串联 `.pip` 导入、信任、激活、工作区和 UI 发布。

A5 仅声明直接 A4 语义依赖；A4 精确引用 A3。portable A5 在扁平 `packages/*.pip` 资产中携带闭包。所有区段、文件名、版本、发布日期和 SHA 在任何代码执行前完成校验。可执行 A3/A4 与浏览器主窗口同权，完整性校验不等于沙箱。
