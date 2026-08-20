# Three-layer browser acceptance

- 打开 `/relation-host`，确认没有预装领域包，原始 RelationGraph 宿主可正常显示。
- 运行 `npm run plugins:relation:build`，分别手动安装 Intent 的 element、node-type、collection ZIP；打开集合并验证节点投影、编辑、命令、执行和 undo/redo。
- 新建另一工作区并安装 Scene 三包；验证人物/物体/事件投影、几何中心、时间顺序、中文 describe/parse 候选及确认后提交。
- 禁用 element 或 node-type 包，验证注册项停止解析、原始关系仍可读且显示缺失能力诊断；刷新后确认已执行模块彻底清除。
- 导出集合并重新导入，验证可达闭包、精确依赖、独立 workspace 与 ID 冲突重写。
- 导入 V1、哈希错误、额外文件、重复 type provider 和缺失依赖包，验证安装原子失败且现有工作区不变。
