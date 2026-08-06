import assert from "node:assert/strict";
import test from "node:test";

import {
  A3CustomNodeRegistry,
  collectA3CustomNodes,
  createA3CustomNodeExtension,
  readA3CustomNodeExtension,
} from "../a3/core/custom-nodes.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

const data = {
  kind: "software-flow/1",
  capability: "software-authoring/1",
  settings: { intent: "Preserve the order boundary", constraints: ["idempotent"] },
};

test("a3 custom nodes use one versioned opaque extension envelope", () => {
  const extension = createA3CustomNodeExtension(data);
  assert.equal(extension.namespace, "intent-map.a3.custom-node");
  assert.equal(extension.schemaVersion, 1);
  assert.deepEqual(readA3CustomNodeExtension(extension), data);
  assert.equal(readA3CustomNodeExtension({
    namespace: "unknown.extension",
    schemaVersion: 99,
    data: null,
  }), null);
  assert.throws(
    () => readA3CustomNodeExtension({ ...extension, schemaVersion: 2 }),
    /Unsupported a3 custom-node schema/,
  );
});

test("a3 registry resolves custom kinds to one explicit capability", () => {
  const registry = new A3CustomNodeRegistry();
  registry.register({
    kind: "software-flow/1",
    capability: "software-authoring/1",
    validateSettings(settings) {
      assert.equal(typeof settings, "object");
    },
  });
  assert.equal(registry.validate(data).kind, "software-flow/1");
  assert.throws(() => registry.register({
    kind: "software-flow/1",
    capability: "other-capability/1",
  }), /already registered/);
  assert.throws(() => registry.validate({
    ...data,
    capability: "other-capability/1",
  }), /requires software-authoring\/1/);
});

test("a3 discovers custom nodes without interpreting ordinary a2 nodes", () => {
  const root = createSampleBusinessRoot();
  root.children[0].extension = createA3CustomNodeExtension(data);
  root.children[1].extension = {
    namespace: "another.a3.extension",
    schemaVersion: 1,
    data: { ignored: true },
  };
  assert.deepEqual(collectA3CustomNodes(root), [{ nodeId: root.children[0].id, data }]);

  const registry = new A3CustomNodeRegistry();
  registry.register({ kind: data.kind, capability: data.capability });
  assert.deepEqual(registry.validateTree(root).map(({ nodeId }) => nodeId), [root.children[0].id]);
});

test("a3 custom-node data rejects unversioned identities and non-JSON settings", () => {
  assert.throws(() => createA3CustomNodeExtension({ ...data, kind: "software-flow" }), /versioned ABI/);
  assert.throws(
    () => createA3CustomNodeExtension({ ...data, settings: { invalid: Number.NaN } }),
    /Invalid a3 custom-node data/,
  );
});
