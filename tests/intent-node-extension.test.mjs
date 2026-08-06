import assert from "node:assert/strict";
import test from "node:test";

import {
  createApplicationDocument,
  getBusinessRoot,
  loadIntentDocument,
  serializeIntentDocument,
} from "../app/runtime/model.ts";
import { createSampleBusinessRoot } from "../app/runtime/sample-business-tree.ts";

const findNode = (node, id) => {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findNode(child, id);
    if (match) return match;
  }
};

test("a2 round-trips opaque extension data without interpreting it", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const businessRoot = getBusinessRoot(document);
  businessRoot.extension = {
    namespace: "software-authoring.intent-map.dev",
    schemaVersion: 7,
    data: {
      projectionIds: ["ui-main", "api-public"],
      constraints: { preserveManualChanges: true },
    },
  };

  const loaded = loadIntentDocument(
    JSON.parse(serializeIntentDocument(document)),
  );
  const loadedBusinessRoot = getBusinessRoot(loaded);
  assert.deepEqual(loadedBusinessRoot?.extension, businessRoot.extension);
});

test("a2 validates only the generic extension envelope", () => {
  const document = createApplicationDocument(createSampleBusinessRoot());
  const businessRoot = getBusinessRoot(document);

  businessRoot.extension = {
    namespace: "unknown.future-extension",
    schemaVersion: 999,
    data: { arbitrary: [null, 1, "text", { nested: false }] },
  };
  assert.doesNotThrow(() =>
    loadIntentDocument(JSON.parse(serializeIntentDocument(document))),
  );

  const malformed = JSON.parse(serializeIntentDocument(document));
  const malformedBusinessRoot = findNode(
    malformed.rootIntent,
    malformed.businessRootId,
  );
  assert.ok(malformedBusinessRoot);
  malformedBusinessRoot.extension.schemaVersion = 0;
  assert.throws(() => loadIntentDocument(malformed), /无效扩展数据/);
});
