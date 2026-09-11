# PIP Self-Hosting：A0–A2 可审计升级闭环

仓库维护 A0 Seed、A1 Loader 和 A2 Pip Map 三个源码 PIP。`scripts/pip-system-sources.mjs` 明确列出每个包的源码边界；A2 同时携带 Pip 核心、通用宿主、外置插件包构建源码、脚本和测试。

```text
系统 A0–A2 source PIP
        ↓ audit / extract
可读源码目录
        ↓ edit / seal
固定源码树
        ↓ isolated build
A0–A2 candidates + receipt
        ↓ test / explicit promote
下一版本系统包
```

`pip:self:extract`、`pip:self:seal`、`pip:self:build` 与 `pip:promote-system` 是独立动作，均拒绝覆盖已有目标。候选 receipt 记录来源、源码树、工具链和三个产物的路径、大小与 SHA；promote 会校验完整 receipt、包身份和所有候选内容。

该闭环提供本地内容证据，不替代发布者签名、代码审查或平台公证。Intent/Scene 三层插件不是系统默认包，不会因为存在于 A2 源码资产中而被自动安装或执行。
