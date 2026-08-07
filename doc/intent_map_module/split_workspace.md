# Split Workspace：`intent.pip + resources/`

[← 返回项目 README](../../README.md) · [Intent Map](intent_map.md) · [a3 Projection Workspace](a3_projection_workspace.md) · [Software Authoring](software_authoring.md) · [返回总体方案](../intent_map_position.md)

## 定位

拆分工作区是 a3 提供的创作存储能力，用来避免把 UI、图片、数据库定义、API、
前后端代码等外树内容持续压入一个大型 `.pip`。a2 仍只接收和编辑 `intent.pip`
中的通用内树，不解释资源索引或文件内容。

```text
workspace/
├── intent.pip
└── resources/
    ├── ui/...
    ├── db/...
    ├── api/...
    ├── frontend/...
    └── backend/...
```

## `intent.pip` 内容

`intent.pip` 保存 Manifest、Loader、内树，以及唯一的小型索引资产：

```text
a3/workspace/resources.json
```

索引按 POSIX 相对路径排序，每项包含 `path`、`mediaType`、十进制字符串形式的
`byteLength` 和小写 SHA-256。索引不含资源字节。路径拒绝绝对路径、反斜杠、空
段、`.`、`..` 和重复项。

## 读写模型

- 打开工作区只读取并解析 `intent.pip`，不遍历或下载全部资源；
- 用户聚焦一个资源时，a3 才逐文件读取并校验长度和 SHA；
- 新增、替换或删除资源只修改对应普通文件，并更新内存索引；
- 保存意图时只重写小型 `intent.pip`，不重新打包整个 `resources/`；
- Web 使用 File System Access API 的目录句柄；Node/CLI 使用原生目录适配器；
- 原生适配器拒绝符号链接目录，文件写入使用同目录临时文件和原子替换。

读取和写入仍使用统一 PIP I/O 策略。拆分工作区不会引入固定大小上限，也不会让
包内声明自行放宽本机或命令行边界。

## 创建工作区

从现有单文件 PIP 创建一个新的、不可覆盖的拆分工作区：

```bash
npm run pip:workspace:split -- source.pip ./my-workspace --allow-package-limits
```

也可以用五个 `--max-*` 参数替代本次不限授权。目标目录必须不存在；命令先在
同级临时目录完成写入，再改名为目标目录，失败不会覆盖已有工作区。

## 与 Bundle 的关系

拆分工作区是默认创作形态；单文件 Bundle 是交换和离线分发形态。打包把
`intent.pip` 与索引指向的资源写入一个版本化 PIP，导入则恢复小型
`intent.pip` 和普通 `resources/` 文件。两者共用同一内树、资源索引和完整性
身份，Bundle 不是编辑时的权威副本。

```bash
npm run pip:workspace:bundle -- ./my-workspace a4_my_app_1_0_0_20260807.pip --allow-package-limits
npm run pip:workspace:unbundle -- a4_my_app_1_0_0_20260807.pip ./restored-workspace --allow-package-limits
```

文件名必须与 Manifest 的层级、artifactName、版本和发布日期完全一致。CLI 不
覆盖已有 Bundle 或工作区；先写同目录临时目标，完成段哈希、资源 SHA 和索引
校验后再原子改名。

Node/CLI 和 Web File System Access 路径都按块读取、写入和计算 SHA-256，不把
大型资源聚合进内存。Web 导出写入用户选择的文件句柄；Web 导入要求用户选择一个
空目录，失败时删除本次创建的 `intent.pip` 与 `resources/`。所有路径统一执行
可导出的 PIP I/O 策略，没有产品内写死的文件大小上限。

## 实现映射

- `a3/workspace/resource-index.ts`：索引格式、路径与完整性；
- `a3/workspace/resource-store.ts`：逐文件存储接口和惰性会话；
- `a3/workspace/browser-directory-store.ts`：Web 目录适配；
- `a3/workspace/node-directory-store.ts`：原生/CLI 目录适配；
- `a3/workspace/split-workspace.ts`：拆分、打开和保存生命周期；
- `a3/bundle/workspace-bundle.ts`：平台无关的 Bundle 往返语义；
- `a3/bundle/node-streaming-*.ts`：Node/原生流式 Bundle 读写；
- `a3/bundle/browser-streaming-*.ts`：Web 文件与目录句柄的流式 Bundle 读写；
- `scripts/split-pip-workspace.mjs`：从普通 PIP 创建工作区；
- `scripts/bundle-pip-workspace.mjs`：工作区流式导出 Bundle；
- `scripts/unbundle-pip-workspace.mjs`：Bundle 流式恢复工作区。

---

[← 返回项目 README](../../README.md) · [Intent Map](intent_map.md) · [a3 Projection Workspace](a3_projection_workspace.md) · [Software Authoring](software_authoring.md) · [返回总体方案](../intent_map_position.md)
