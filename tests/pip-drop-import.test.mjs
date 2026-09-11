import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pipFilename } from "../pip-editor/pip-package/index.ts";
import {
  createPendingBatch,
  preparePipBatch,
} from "../pip-editor/pip-host/packages/import-batch.ts";
import { runPreparedPipBatch } from "../pip-editor/pip-host/packages/import-batch-runner.ts";
import { exportNodeMap } from "../pip-editor/pip-host/packages/export-node-map.ts";
import {
  createNodeMapWorkspace,
  decodeNodeMapPackage,
} from "../pip-editor/pip-host/packages/node-map-package.ts";
import { isPipFile } from "../pip-editor/pip-host/view/pip-drop-files.ts";
import { buildIntentPluginSuite } from "../pip-editor-io/intent/suite.ts";

const pipFile = (bytes, manifest) => new File(
  [bytes],
  pipFilename(manifest),
  { type: "application/vnd.intent-map.pip" },
);

test("PIP drop selection accepts extensions and MIME without accepting ordinary files", () => {
  assert.equal(isPipFile(new File([], "plugin.pip")), true);
  assert.equal(isPipFile(new File([], "plugin.bin", {
    type: "application/vnd.intent-map.pip",
  })), true);
  assert.equal(isPipFile(new File([], "notes.txt")), false);
});

test("PIP batches preflight independently and sort A3 through A5", async () => {
  const suite = await buildIntentPluginSuite();
  const files = [
    pipFile(suite.nodeMapPip, suite.nodeMap.manifest),
    new File(["not a pip"], "broken.pip"),
    pipFile(suite.nodeTypePip, suite.nodeType.manifest),
    pipFile(suite.elementPip, suite.element.manifest),
  ];
  const batch = createPendingBatch("batch.order", files);
  const prepared = await preparePipBatch(batch, files);

  assert.deepEqual(
    prepared.files.map((file) => file.layer),
    ["a3", "a4", "a5"],
  );
  assert.equal(prepared.statuses[1].state, "failed");
  assert.match(prepared.statuses[1].message, /PIP|header|magic/i);
});

test("a failed file does not stop later files or remove earlier successes", async () => {
  const suite = await buildIntentPluginSuite();
  const files = [
    pipFile(suite.elementPip, suite.element.manifest),
    pipFile(suite.nodeTypePip, suite.nodeType.manifest),
    pipFile(suite.nodeMapPip, suite.nodeMap.manifest),
  ];
  const batch = createPendingBatch("batch.continue", files);
  const prepared = await preparePipBatch(batch, files);
  const installedElements = new Set();
  let rejectFirstNodeType = true;
  let openedNodeMaps = 0;

  const result = await runPreparedPipBatch(batch, prepared, {
    context: () => ({
      confirmTrust: () => true,
      trustHashes: () => undefined,
      installElement: async (plugin) => {
        const id = plugin.manifest.packageId;
        if (installedElements.has(id)) return "already-active";
        installedElements.add(id);
        return "installed";
      },
      installNodeType: async () => {
        if (rejectFirstNodeType) {
          rejectFirstNodeType = false;
          throw new Error("expected A4 failure");
        }
        return "installed";
      },
      uninstallElement: (id) => installedElements.delete(id),
      uninstallNodeType: () => undefined,
      openNodeMap: () => {
        openedNodeMaps += 1;
      },
    }),
    onUpdate: () => undefined,
    resolveInstalled: () => undefined,
  });

  assert.deepEqual(
    result.files.map((file) => file.state),
    ["succeeded", "failed", "succeeded"],
  );
  assert.equal(installedElements.has(suite.element.manifest.packageId), true);
  assert.equal(openedNodeMaps, 1);
});

test("a thin A5 resolves exact A3 and A4 dependencies from the same batch", async () => {
  const suite = await buildIntentPluginSuite();
  const source = await decodeNodeMapPackage(suite.nodeMapPip);
  const workspace = {
    ...createNodeMapWorkspace(
      source.nodeMap,
      "workspace.batch-thin",
      source.contentSha256,
    ),
    undo: [],
    redo: [],
    capabilityDiagnostics: [],
  };
  const thinA5 = await exportNodeMap(workspace, {
    source,
    portable: false,
  });
  const files = [
    new File(
      [thinA5],
      pipFilename(source.nodeMap.manifest),
      { type: "application/vnd.intent-map.pip" },
    ),
    ...source.nodeTypes.map((plugin) =>
      pipFile(plugin.pipBytes, plugin.manifest)),
    ...source.elementPlugins.map((plugin) =>
      pipFile(plugin.pipBytes, plugin.manifest)),
  ];
  const batch = createPendingBatch("batch.thin", files);
  const prepared = await preparePipBatch(batch, files);
  let openedNodeMaps = 0;

  const result = await runPreparedPipBatch(batch, prepared, {
    context: () => ({
      confirmTrust: () => true,
      trustHashes: () => undefined,
      installElement: async () => "installed",
      installNodeType: async () => "installed",
      openNodeMap: () => {
        openedNodeMaps += 1;
      },
      uninstallElement: () => undefined,
      uninstallNodeType: () => undefined,
    }),
    onUpdate: () => undefined,
    resolveInstalled: () => undefined,
  });

  assert.equal(result.files.every((file) => file.state === "succeeded"), true);
  assert.equal(openedNodeMaps, 1);
});

test("host and workspace canvases share the nested PIP drop zone", async () => {
  const files = await Promise.all([
    "host-canvas.tsx",
    "free-workspace-canvas.tsx",
    "legacy-workspace-canvas.tsx",
  ].map((name) => readFile(
    new URL(
      `../pip-editor/pip-host/view/${name}`,
      import.meta.url,
    ),
    "utf8",
  )));
  const source = files.join("\n");

  assert.equal(files.every((file) => file.includes("<PipDropZone")), true);
  assert.match(source, /onUnsupportedPipDrop/);
  assert.doesNotMatch(source, /host\.plugin-manager/);
});
