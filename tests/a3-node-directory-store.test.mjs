import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openNodeSplitWorkspace } from "../a3/workspace/node-directory-store.ts";

test("native split workspace writes intent and nested resources as independent files", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "intent-map-workspace-"));
  context.after(async () => (await import("node:fs/promises")).rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "resources"));
  await writeFile(path.join(root, "intent.pip"), new Uint8Array([1, 2, 3]));

  const workspace = await openNodeSplitWorkspace(root);
  await workspace.resources.write({
    path: "backend/src/main.rs",
    mediaType: "text/plain; charset=utf-8",
    bytes: new TextEncoder().encode("fn main() {}\n"),
  });
  assert.equal(
    await readFile(path.join(root, "resources/backend/src/main.rs"), "utf8"),
    "fn main() {}\n",
  );
  await workspace.writeIntentPip(new Uint8Array([4, 5]));
  assert.deepEqual(await workspace.readIntentPip(), new Uint8Array([4, 5]));
});

test("native split workspace rejects symlinked resource parents", async (context) => {
  if (process.platform === "win32") return;
  const root = await mkdtemp(path.join(os.tmpdir(), "intent-map-workspace-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "intent-map-outside-"));
  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "resources"));
  await writeFile(path.join(root, "intent.pip"), new Uint8Array([1]));
  await symlink(outside, path.join(root, "resources/escape"));

  const workspace = await openNodeSplitWorkspace(root);
  await assert.rejects(
    () => workspace.resources.write({
      path: "escape/secret.txt",
      mediaType: "text/plain",
      bytes: new Uint8Array([9]),
    }),
    /non-symlink directory/,
  );
});
