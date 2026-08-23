import assert from "node:assert/strict";
import test from "node:test";
import { importPip } from "../pip-editor/relation-host/packages/import-pip.ts";
import { buildIntentPluginSuite } from "../pip-editor-io/intent/suite.ts";

test("importPip validates an A5 closure, confirms once and dispatches A3-A4-A5", async () => {
  const suite = await buildIntentPluginSuite(), calls = [], trusted = [];
  const result = await importPip(suite.nodeMapPip, {
    confirmTrust: (_manifest, hashes) => { calls.push(`confirm:${hashes.length}`); return true; },
    trustHashes: (hashes) => trusted.push(...hashes),
    installElement: async () => { calls.push("a3"); return "installed"; },
    installNodeType: async () => { calls.push("a4"); return "installed"; },
    openNodeMap: async () => calls.push("a5"),
  });
  assert.equal(result.layer, "a5");
  assert.deepEqual(calls, ["confirm:5", "a3", "a3", "a4", "a4", "a5"]); assert.equal(trusted.length, 5);
});

test("failed A5 activation rolls back capabilities and persists no trust", async () => {
  const suite = await buildIntentPluginSuite(), calls = [], trusted = [];
  await assert.rejects(() => importPip(suite.nodeMapPip, {
    confirmTrust: () => true, trustHashes: (hashes) => trusted.push(...hashes),
    installElement: async () => "installed", installNodeType: async () => { throw new Error("activation failed"); },
    uninstallElement: (id) => calls.push(`rollback:${id}`), uninstallNodeType: () => {}, openNodeMap: () => {},
  }), /activation failed/);
  assert.deepEqual(trusted, []);
  assert.deepEqual(new Set(calls), new Set([`rollback:${suite.element.manifest.packageId}`, `rollback:${suite.support.element.manifest.packageId}`]));
});
