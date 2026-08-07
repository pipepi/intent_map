# Intent Map

Intent Map 是一个业务无关的分形节点地图编辑器，以 `.pip` 应用的形式运行，用于构建、观察、编辑、组合和导出其他节点应用。

系统中只有无状态且长期稳定的初始加载器 Seed 是原生可执行文件；新版加载器、Intent Map、软件开发复杂度掌控能力和实际应用都分别以可演进的 `.pip` 存在。`.pip` 既是可运行和可分发的应用包，也是可继续编辑和组合的创作单元。

软件开发复杂度掌控是 Intent Map 上的一组可选业务节点能力，Crypto 交易所是其实际应用案例。人工、团队、Agent、脚本和其他工具都可以按需参与；Agent 可选择通过 PIP MCP Server 编辑、填充、导入和导出 `.pip`，但不是系统成立的前提。

> **核心结构：Seed 负责启动，`.pip` 负责一切演进；Intent Map 负责通用节点编辑，具体能力由节点应用提供。**

完整的系统定位、递归 PIP 架构、软件开发能力、Crypto 交易所案例与可选 MCP 接入参见：[Intent Map：方案与产品定位](doc/intent_map_position.md)。

当前 a2/a3 边界、拆分资源工作区、Bundle 与可配置容量策略的长期实施进度参见：
[a2/a3 Workspace Refactor Execution Ledger](doc/a2_a3_workspace_execution.md)。
已实现的 `intent.pip + resources/` 创作存储契约参见：
[Split Workspace](doc/intent_map_module/split_workspace.md)。
已实现的 a3 custom-node、可选外树投影和乐观一致性诊断参见：
[a3 Custom Node 与可选投影工作区](doc/intent_map_module/a3_projection_workspace.md)。
已实现的 a0–a3 源码审计、重建、候选构建和显式发布闭环参见：
[PIP Self-Hosting](doc/intent_map_module/pip_self_hosting.md)。

## Implementation

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run pip:build`: build the static application and deterministic `.pip`
- `npm run pip:dist`: build the layered Seed, Loader, and application distribution
- `npm run pip:system`: rebuild the Git-tracked default a0–a3 source packages
- `npm run pip:install-user -- <file.pip>`: install an immutable version into the user Registry
- `npm run pip:self:audit`: compare every maintained source PIP with its repository boundary
- `npm run pip:self:extract -- <new-source-directory>`: reconstruct ordinary source files without overwriting
- `npm run pip:self:seal -- <edited-source-directory>`: seal an edited candidate source tree
- `npm run pip:self:build -- <source-directory> <new-candidate-directory>`: build isolated a0–a3 candidates and a receipt
- `npm run pip:promote-system -- <candidate-directory> <package-id> --allow-package-limits`: promote one receipt-verified maintained candidate
- `npm run pip:workspace:split -- <bundle.pip> <new-directory> --allow-package-limits`: create a non-overwriting split workspace
- `npm run pip:workspace:bundle -- <workspace-directory> <versioned.pip> --allow-package-limits`: stream a split workspace into one exchange Bundle
- `npm run pip:workspace:unbundle -- <versioned.pip> <new-directory> --allow-package-limits`: stream a Bundle back into a split workspace
- `npm run pip:projection:audit -- <workspace-directory> --allow-package-limits`: inspect optional a3 projections without modifying the workspace
- `npm run pip:software:spec -- <workspace-directory> <node-id> --allow-package-limits`: materialize one validated Software Authoring specification
- `npm run pip:cli`: build the versioned diagnostic Seed CLI under `dist/pip-runtime/tools/`
- `npm run pip:verify`: verify the generated `.pip`
- `npm run test:pip`: test the TypeScript format, Rust core, CLI, and desktop shell
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Layered PIP Runtime

Seed and `.pip` are separate files. Every artifact carries its architecture
layer, semantic version, and release date in the filename:

```text
dist/pip-runtime/
├── a0_pip_seed_1_0_0_20260806.app  # macOS; Windows uses .exe
└── pip/
    ├── a0_pip_seed_1_0_0_20260806.pip
    ├── a1_loader_1_0_0_20260806.pip
    ├── a2_intent_map_1_0_0_20260806.pip
    └── a3_software_authoring_1_0_0_20260806.pip
```

Seed loads the unique `a1` Loader from `pip/`. The Loader selects exactly one
`a2` generic editor. An optional `a3` workspace host can compose capabilities
around that editor, while `a2` itself neither imports nor starts `a3`.
System defaults are Git-tracked under `packages/system/`. User a0–a5 packages,
profiles, trust decisions, and workspaces live in the platform user-data directory.
Use `--profile`, `--editor`, or `--select-editor` to override defaults without
silently falling back from an invalid explicit choice.

```powershell
.\dist\pip-runtime\tools\a0_pip_seed_cli_1_0_0_20260806.exe --verify .\dist\pip-runtime\pip\a2_intent_map_1_0_0_20260806.pip --allow-package-limits
```

On macOS, double-click the versioned `.app` to launch without Terminal. Desktop
arguments remain available through Launch Services:

```bash
open -n dist/pip-runtime/a0_pip_seed_1_0_0_20260806.app --args \
  --pip "$PWD/dist/pip-runtime/pip/a1_loader_1_0_0_20260806.pip" --select-editor
```

Use `npm run pip:cli` for terminal hosting and `--verify` diagnostics.
See [Runtime profiles, editor selection, and capability composition](doc/intent_map_module/pip_runtime_profiles.md).

### PIP I/O policy

PIP byte, resource, expanded-size, resource-count, and compression-ratio limits do
not use hidden product constants. Each field is `ask`, an explicit decimal value,
or `unlimited`. The editor's **容量策略** dialog saves the current values into the
next exported `.pip`; **保存为本机默认** stores the higher-priority local policy.
Desktop and CLI startup resolve command-line values over that local policy.

The available command-line options are:

```text
--max-pip-size <bytes|unlimited>
--max-resource-size <bytes|unlimited>
--max-expanded-size <bytes|unlimited>
--max-resource-count <count|unlimited>
--max-compression-ratio <ratio|unlimited>
--allow-package-limits
```

`--allow-package-limits` explicitly allows every still-unconfigured field for
the current process. A non-interactive CLI rejects operations while any field
still requires confirmation. The desktop asks before granting those fields for
the current launch. A package cannot silently relax the local or CLI boundary.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
