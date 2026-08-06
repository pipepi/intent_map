# Loader 0：无状态初始加载器（种皮）

[← 返回总体方案](../intent_map_position.md) · [下一篇：Loader N →](loader_n.md)

## 定位

Loader 0 是系统中唯一需要操作系统直接双击运行的原生文件。它是无状态、尽可能小且长期稳定的初始加载器。

```text
操作系统
→ Loader 0
→ 验证并启动 .pip
```

它类似 bootloader 或种皮：只负责让 PIP 体系开始运行，不成为持续吸收功能的应用平台。

## 核心职责

- 根据启动参数、Runtime Profile 或运行时仓库规则确定待运行的 `.pip`；
- 在无法唯一确定时提供最小文件选择界面；
- 读取选定的 `.pip` 字节；
- 识别并验证 PIP 包结构；
- 校验完整性和必要的安全边界；
- 提供最小运行环境；
- 启动包中声明的入口；
- 在无法启动时返回最小、明确的错误。

## 明确不负责

- 不保存最近打开记录或用户工作区状态；
- 不实现文件管理、应用市场或自动更新体验；
- 不包含 Intent Map 节点编辑能力；
- 不理解 Software Authoring 或 Crypto CEX；
- 不内置 Agent 或 MCP 编排；
- 不在自身可执行文件中内嵌 `.pip`；
- 不因上层功能变化而频繁升级。

## PIP 选择规则

Loader 0 与 `.pip` 始终是相互独立的文件。Loader 0 不内嵌默认应用，也不从自身可执行文件的尾部提取 PIP。

启动时按以下优先级确定目标：

1. 如果启动参数显式提供 `.pip` 路径，加载该文件；
2. 否则扫描 Loader 0 分发根目录的 `pip/`；
3. 只接受命名和 manifest 均有效的 `a1` Loader PIP；
4. 恰好存在一个有效 `a1` PIP 时，自动加载它；
5. 不存在或存在多个有效 `a1` PIP 时，CLI 报错，桌面 Seed 打开最小文件选择界面；
6. 显式路径、Runtime Profile 和自动发现的目标都必须是有效 `a1` Loader PIP。

```text
显式 .pip 参数？
├── 是 → 加载指定文件
└── 否 → 扫描分发根目录的 pip/
          ├── 1 个有效 a1 PIP → 自动加载
          ├── 0 个有效 a1 PIP → 参数提示或文件选择
          └── 多个有效 a1 PIP → 参数提示或文件选择
```

显式参数始终优先，这使脚本、快捷方式和自动化环境能够确定性启动指定 Loader。运行时仓库自动发现服务于官方默认分发体验。

## 输入与输出

输入：

- 启动参数中可选的 `.pip` 路径；
- 分发根目录 `pip/` 中可发现的 a1；
- 必要时用户通过最小界面选择的 `.pip`；
- 必要的操作系统启动上下文。

输出：

- 成功启动 `.pip` 入口；或
- 一个可诊断的验证/启动错误。

Loader 0 不拥有上层应用状态。应用退出后，种皮自身不保留业务状态。

## 与 Loader N 的边界

Loader 0 只提供最小加载机制；文件选择、版本管理、更新、权限交互和恢复等持续变化的功能属于 [Loader N](loader_n.md)。

目标启动链是：

```text
Loader 0
→ a1_loader_{major}_{minor}_{patch}_{YYYYMMDD}.pip
→ 其他 .pip
```

推荐的最简分发目录是两个独立文件：

```text
pip-runtime/
├── a0_pip_seed_1_0_0_20260806.app  # macOS；Windows 为 .exe
└── pip/
    ├── a0_pip_seed_1_0_0_20260806.pip
    ├── a1_loader_1_0_0_20260806.pip
    ├── a2_intent_map_1_0_0_20260806.pip
    └── a3_software_authoring_1_0_0_20260806.pip
```

macOS 双击版本化 `.app` 时不会打开 Terminal；Windows 双击版本化 `.exe`。
因为 `pip/` 中只有一个默认有效 `a1` PIP，Loader 0 可以直接启动它。macOS
Seed 从 `.app/Contents/MacOS/` 向外定位到 `.app` 的父目录，因此 Loader
和所有系统 PIP 仍保持外置、可替换。

macOS 命令行参数通过 `open -n` 保留：

```bash
open -n a0_pip_seed_1_0_0_20260806.app --args \
  --pip "$PWD/pip/a1_loader_1_0_0_20260806.pip" --select-editor
```

验证和终端宿主继续使用 `tools/a0_pip_seed_cli_{version}_{date}`。

## PIP 容量策略

Seed 不写死 PIP 文件、单资源、展开后内容、资源数量或压缩比上限。五个字段分别
支持“每次确认”、非负十进制数值和“不限制”。解析优先级为：

```text
命令行显式参数 > 本机策略 > 本次桌面确认
```

编辑器“容量策略”界面的“保存为本机默认”会写入平台用户数据目录；Web 静态版
使用浏览器本地存储。包内策略随 `.pip` 导出，用来表达该包的容量请求，但不能
自行放宽命令行或本机边界。本机策略更改在当前编辑器读写中立即生效，原生 Seed
在下次启动时读取它。

CLI 可以逐项配置：

```text
--max-pip-size <bytes|unlimited>
--max-resource-size <bytes|unlimited>
--max-expanded-size <bytes|unlimited>
--max-resource-count <count|unlimited>
--max-compression-ratio <ratio|unlimited>
```

`--allow-package-limits` 仅为本进程把尚未配置的字段显式设为“不限制”。非交互
CLI 仍有字段为“每次确认”时直接报错；桌面端则在读取 PIP 前请求一次本次启动
授权。所有数值使用十进制字符串存储，避免 JavaScript 大整数精度损失。

## 实现映射

当前或未来属于该边界的代码包括：

- `pip-core/`：PIP 包解析、校验和基础格式；
- `pip-seed/`：最小命令行或宿主启动能力；
- `pip-seed-tauri/`：最小桌面 WebView 宿主；
- 与原生平台启动直接相关的少量构建逻辑。

实现时应持续检查：某个新功能是否真的必须原生存在。如果可以由 `.pip` 实现，就应上移到 Loader N 或其他应用。

## 验收条件

- 没有预先存在的用户状态也能运行；
- 相同输入产生稳定的验证结果；
- 能启动最小有效 `.pip`；
- 显式参数能确定性覆盖运行时仓库自动发现；
- `pip/` 恰好一个有效 `a1` 时能够直接双击启动；
- `pip/` 为零个或多个有效 `a1` 时不会擅自选择，并能要求参数或提供选择界面；
- 只在 `pip/` 自动发现 a1，不接受其他层级作为 Loader；
- Loader 0 可执行文件中不包含内嵌 `.pip`；
- 能拒绝损坏或不受支持的包；
- 上层 `.pip` 更新不要求同步修改 Loader 0；
- 原生依赖和平台权限保持最少。

---

[← 返回总体方案](../intent_map_position.md) · [下一篇：Loader N →](loader_n.md)
