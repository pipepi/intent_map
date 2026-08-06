# Intent Map

Intent Map 是面向 Agent 时代的软件创作与掌控工作台。它将实现无关的业务核心物流动场景和约束沉淀为分形内树，让人与 Agent 在合适颗粒度的树枝上达成共识；UI、DB Tables、API、代码、外围系统、分发和分利润等层级均可按需披露，并可选择手工、人机协作或 Agent 代理实现。

Agent 的每次输出被限制在可理解、可修改、可接管或可重来的局部范围，并收敛为可视、可聚焦、可继续协作的 `.pip`。Intent Map 既接收和组织多 Agent 输出，也通过 PIP MCP Server 为 Agent 提供编辑、填充、导入和导出 `.pip` 的标准工具。

> **核心价值：通过分形边界、逐层披露和局部填充，获得对软件复杂度的超强掌控力。**

完整的方案、产品定位、八层模型、`.pip` 范式与 MCP 架构参见：[Intent Map：方案与产品定位](doc/intent_map_position.md)。

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
- `npm run pip:exe`: build the windowed Tauri `intent-map.pip.exe`
- `npm run pip:cli`: build the diagnostic `pip-seed-cli.exe`
- `npm run pip:verify`: verify the generated `.pip`
- `npm run test:pip`: test the TypeScript format, Rust core, CLI, and desktop shell
- `npm run db:generate`: generate Drizzle migrations after schema changes

## PIP Desktop Seed

`dist/pip/intent-map.pip.exe` is a Windows GUI application. Double-clicking it
opens the embedded Intent Map in a native Tauri/WebView2 window without a
console window, external browser, loopback port, or Node.js runtime.

The package format and executable overlay are implemented by `pip-core`.
`pip-seed-cli.exe` remains a separate recovery tool:

```powershell
.\dist\pip\pip-seed-cli.exe --verify .\dist\pip\intent-map.pip
.\dist\pip\pip-seed-cli.exe --extract .\dist\pip\intent-map.pip.exe .\recovered.pip
```

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
