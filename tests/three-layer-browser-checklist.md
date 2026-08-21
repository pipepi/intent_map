# Three-layer browser acceptance

- 打开 `/relation-host`，确认没有预装领域包，原始 RelationGraph 宿主可正常显示。
- 运行 `npm run plugins:relation:build`，分别手动安装 Intent 的 element、node-type、collection ZIP；打开集合并验证节点投影、编辑、命令、执行和 undo/redo。
- 新建另一工作区并安装 Scene 三包；确认象限和管道两个 Web Component 同时出现，宽屏两列、窄屏纵向堆叠，而非视图切换。
- 验证两个视图读取同一份 8 个实体和 13 个事件：事件几何中心、起止时间、坐标轴、时间轴、关系线、标签、图例和 Inspector 均可见。
- 分别操作两个视图的相机和选择，确认状态互不覆盖；在象限旋转 90° 时拖动实体，pointerup 只产生一次 history 提交，管道视图同步更新，undo/redo 同时恢复两个投影。
- 用 Enter/Space 选择节点，检查事件/关系高亮与渐隐；验证中文 describe/parse 候选及确认后提交。
- 禁用 Scene element 或 node-type 包，确认两个已打开的投影实例立即降级，原始 RelationGraph 仍可读取。
- 禁用 element 或 node-type 包，验证注册项停止解析、原始关系仍可读且显示缺失能力诊断；刷新后确认已执行模块彻底清除。
- 导出集合并重新导入，验证可达闭包、精确依赖、独立 workspace 与 ID 冲突重写。
- 导入 V1、哈希错误、额外文件、重复 type provider 和缺失依赖包，验证安装原子失败且现有工作区不变。
