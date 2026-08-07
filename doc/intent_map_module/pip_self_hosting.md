# PIP Self-Hosting：a0–a3 可审计升级闭环

[← Intent Map](intent_map.md) · [返回总体方案](../intent_map_position.md) · [Software Authoring →](software_authoring.md)

## 定位

系统默认 a0–a3 都是可以被打开和编辑的源码 PIP。自举闭环把这些包中的
`source/` 资产重建为普通源码目录，允许用户或工具在可掌控的小范围内修改，再生成
隔离候选、测试并显式发布。运行中的包永远不原地覆盖自身。

```text
系统 a0–a3 source PIP
        ↓ audit / extract
可读、可编辑的普通源码目录
        ↓ 用户、团队或可选 Agent 修改
候选源码 seal
        ↓ isolated build
候选 a0–a3 PIP + build receipt
        ↓ test / review / explicit promote
下一版本系统包
```

## 权威源码边界

`scripts/pip-system-sources.mjs` 是每个系统包源码边界的唯一清单：

- a0 `pip-seed`：PIP Core、CLI Seed 和 Tauri Seed；
- a1 `pip-loader`：Loader UI 与配置；
- a2 `intent-map`：`app/`、`public/` 和完整 Next 构建配置；
- a3 `software-authoring`：`a3/`、构建脚本、测试和 release 配置。

构建缓存、`node_modules`、Git 数据、`.DS_Store`、分发目录和用户工作区不进入源码
PIP。`npm run pip:self:audit` 逐文件比较仓库与系统 PIP，输出稳定 JSON；缺失、多余
或内容改变都会返回失败。

## 四道显式闸门

### 1. 重建

```bash
npm run pip:self:extract -- ./reconstructed-source
```

目标必须不存在。命令先写同级临时目录，再原子发布；只读取 `source/`，不执行包内
代码。路径逃逸、符号链接和内容不同的重复路径都会失败。`.pip/` 中的来源 receipt
记录四个输入 PIP SHA 和合并源码树 SHA。

### 2. 编辑与封存

使用 a2、a3、普通编辑器或其他工具修改源码后，显式封存候选状态：

```bash
npm run pip:self:seal -- ./reconstructed-source
```

封存 receipt 保留父来源 receipt SHA，同时记录修改后的完整源码树 SHA。封存后任何
未重新封存的变化都会被候选构建拒绝。`seal` 使用 `wx`，不会静默替换已有候选
receipt；要开始另一轮修改，应从新的 extract/copy 工作区开始。

### 3. 隔离候选构建

```bash
npm run pip:self:build -- ./reconstructed-source ./candidates
```

目标必须不存在。构建在固定、临时的隔离根执行，从调用仓库借用锁文件对应的已安装
工具链，但运行重建源码中的构建脚本。产物只写候选目录，不写系统 Registry。
`self-hosting-build-receipt.json` 记录源码 receipt SHA、源码树 SHA、Node/平台/架构、
lockfile SHA，以及四个候选 PIP 的路径、大小和 SHA。相同源码与工具链重复构建应得到
相同 receipt。

### 4. 显式发布

先独立运行 lint、工程测试、PIP/Rust 测试和分发验证；更新 `pip.release.json` 后，
按包逐个发布：

```bash
npm run pip:promote-system -- ./candidates pip-loader --allow-package-limits
```

promote 会重新校验完整 receipt 中所有 a0–a3 文件，而不只校验目标包；Manifest、
文件路径、版本、发布日期、packageId 和 SHA 必须与当前 release 配置一致。目标通过
`wx` 写入，新版本已存在时失败。发布选择始终由人显式确认，不因最高版本或同名文件
自动替换。

## 安全与回退

- `open`、`extract`、`seal`、`build`、`test` 和 `promote` 是不同权限动作；
- 解析源码 PIP 不执行 Loader 或 capability 代码；
- 候选构建不覆盖权威系统包，也不包含 a4/a5 用户数据；
- receipt 是可复核的内容证据，不替代代码审查、签名或平台公证；
- 每个功能点独立 commit，阶段 checkpoint 可直接创建恢复分支；
- 发布错误用新版本或 `git revert` 修正，不 force-push、不覆盖旧版本。

## 当前实现映射

- `scripts/audit-system-sources.mjs`：仓库与 source PIP 一致性审计；
- `scripts/extract-system-sources.mjs`：安全、非覆盖式源码重建；
- `scripts/seal-self-hosting-source.mjs`：编辑后候选源码封存；
- `scripts/build-self-hosted-candidates.mjs`：隔离且确定性的 a0–a3 候选构建；
- `scripts/promote-system-pip.mjs`：receipt-gated 显式发布；
- `tests/pip-self-*.test.mjs`、`tests/pip-promote-system.test.mjs`：闭环与篡改测试。

## 验收结论

当前实现已经证明：Git 跟踪的 a0–a3 PIP 能恢复完整构建源码；局部修改必须显式封存；
同一封存源码可以重复生成相同的四包候选和 receipt；篡改、漂移、错误身份或覆盖发布
都会失败。它完成的是本地、可审计的自举闭环，远程签名、供应链证明和自动更新仍是
后续能力。

---

[← Intent Map](intent_map.md) · [返回总体方案](../intent_map_position.md) · [Software Authoring →](software_authoring.md)
