import assert from "node:assert/strict";
import test from "node:test";

import { compatibleEditors, resolveExactEditor } from "../pip-editor/pip-package/profile.ts";

const reference = {
  origin: "user",
  packageId: "my-editor",
  version: "1.0.0",
  releaseDate: "20260807",
  sha256: "a".repeat(64),
};

const editor = {
  file: "a2_my_editor_1_0_0_20260807.pip",
  origin: "user",
  readOnly: false,
  installed: true,
  trustedForExecution: true,
  valid: true,
  packageId: "my-editor",
  layer: "a2",
  packageVersion: "1.0.0",
  releaseDate: "20260807",
  sha256: "a".repeat(64),
  providedEditorKinds: ["table/1"],
  supportedDocumentKinds: ["intent-document/3"],
  providedCapabilities: [],
};

test("runtime profile editor references resolve by origin, version and SHA", () => {
  assert.equal(resolveExactEditor([editor], reference), editor);
  assert.throws(() => resolveExactEditor([{ ...editor, sha256: "b".repeat(64) }], reference), /exactly once/);
});

test("compatible a2 editors are ranked by target preference without forcing a switch", () => {
  const tree = { ...editor, file: "tree.pip", packageId: "tree", providedEditorKinds: ["tree-map/1"] };
  assert.deepEqual(
    compatibleEditors([editor, tree], ["intent-document/3"], ["tree-map/1"]).map((entry) => entry.packageId),
    ["tree", "my-editor"],
  );
});
