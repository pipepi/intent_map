# Split Workspace：`intent.pip + resources/`

[← 返回项目 README](../../README.md) · [Intent Map](intent_map.md) · [Software Authoring](software_authoring.md) · [返回总体方案](../intent_map_position.md)

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

拆分工作区是默认创作形态；单文件 Bundle 是交换和离线分发形态。Phase 5 会把
`intent.pip` 与索引指向的资源按需打成 Bundle，并在导入后回到拆分工作区。两者
共用同一内树和完整性身份，Bundle 不是编辑时的权威副本。

## 实现映射

- `a3/workspace/resource-index.ts`：索引格式、路径与完整性；
- `a3/workspace/resource-store.ts`：逐文件存储接口和惰性会话；
- `a3/workspace/browser-directory-store.ts`：Web 目录适配；
- `a3/workspace/node-directory-store.ts`：原生/CLI 目录适配；
- `a3/workspace/split-workspace.ts`：拆分、打开和保存生命周期；
- `scripts/split-pip-workspace.mjs`：非破坏性 CLI 入口。

---

[← 返回项目 README](../../README.md) · [Intent Map](intent_map.md) · [Software Authoring](software_authoring.md) · [返回总体方案](../intent_map_position.md)
