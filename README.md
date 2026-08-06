# Intent Map

Intent Map 是一个业务无关的分形节点地图编辑器，以 `.pip` 应用的形式运行，用于构建、观察、编辑、组合和导出其他节点应用。

系统中只有无状态且长期稳定的初始加载器 Seed 是原生可执行文件；新版加载器、Intent Map、软件开发复杂度掌控能力和实际应用都分别以可演进的 `.pip` 存在。`.pip` 既是可运行和可分发的应用包，也是可继续编辑和组合的创作单元。

软件开发复杂度掌控是 Intent Map 上的一组可选业务节点能力，Crypto 交易所是其实际应用案例。人工、团队、Agent、脚本和其他工具都可以按需参与；Agent 可选择通过 PIP MCP Server 编辑、填充、导入和导出 `.pip`，但不是系统成立的前提。

> **核心结构：Seed 负责启动，`.pip` 负责一切演进；Intent Map 负责通用节点编辑，具体能力由节点应用提供。**

完整的系统定位、递归 PIP 架构、软件开发能力、Crypto 交易所案例与可选 MCP 接入参见：[Intent Map：方案与产品定位](doc/intent_map_position.md)。

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
├── a1_loader_1_0_0_20260806.pip
└── pip/
    └── a2_intent_map_1_0_0_20260806.pip
```

Seed loads the unique `a1` Loader beside it. The Loader discovers `a2`–`a5`
applications in `pip/`. When the configured default resolves to exactly one
valid package, Seed activates it before creating the window, so the application
opens without flashing the Loader screen. Otherwise, or with `--select-app`,
the Loader list is shown. The CLI Seed verifies external PIPs and never extracts an
embedded payload:

```powershell
.\dist\pip-runtime\tools\a0_pip_seed_cli_1_0_0_20260806.exe --verify .\dist\pip-runtime\pip\a2_intent_map_1_0_0_20260806.pip
```

On macOS, double-click the versioned `.app` to launch without Terminal. Desktop
arguments remain available through Launch Services:

```bash
open -n dist/pip-runtime/a0_pip_seed_1_0_0_20260806.app --args \
  --pip "$PWD/dist/pip-runtime/a1_loader_1_0_0_20260806.pip" --select-app
```

Use `npm run pip:cli` for terminal hosting and `--verify` diagnostics.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
