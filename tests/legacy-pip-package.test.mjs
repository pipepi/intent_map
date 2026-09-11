import assert from "node:assert/strict";
import test from "node:test";
import {
  encodePip, decodePip, UNLIMITED_PIP_IO_POLICY,
} from "../pip-editor/pip-package/index.ts";
import {
  align8, readU64, writeU64, sha256,
  PIP_HEADER_SIZE, PIP_SECTION_ENTRY_SIZE,
} from "../pip-editor/pip-package/format.ts";
import { createCorePipGraph, createPipDocument } from "../pip-editor/pip/index.ts";
import { baseNodeMapManifest } from "../pip-editor-io/shared/manifest-builders.ts";
import { decodeNodeMapPackage } from "../pip-editor/pip-host/packages/node-map-package.ts";
import { migrate_node_map_manifest } from "../pip-editor/pip-host/packages/legacy-node-map.ts";

const io_options = { policy: UNLIMITED_PIP_IO_POLICY };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// 重建带正确区段哈希的旧格式测试包，生产编码器始终只生成新 ABI。
async function old_package() {
  const dependency = {
    origin: "user", packageId: "official.relation-projection-types",
    version: "2.0.0", releaseDate: "20260822", sha256: "a".repeat(64),
  };
  const manifest = baseNodeMapManifest("test.migration", "Migration", ["pip.core.type"], [dependency]);
  const document = createPipDocument(createCorePipGraph(), ["pip.core.type"]);
  const bytes = await encodePip({
    manifest,
    loaderSource: "export default () => null",
    rootTreeText: JSON.stringify(document),
    assets: [{ path: "workspace.json", mime: "application/json", bytes: encoder.encode('{"views":{}}') }],
  }, io_options);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sections = Array.from({ length: 4 }, (_, index) => {
    const entry = 16 + index * PIP_SECTION_ENTRY_SIZE;
    const offset = readU64(view, entry);
    return bytes.slice(offset, offset + readU64(view, entry + 8));
  });
  const old_manifest = {
    ...manifest, nodeMapAbi: "relation-node-map/1",
    rootNodeIds: ["relation.core.type"], rootNodeId: "relation.core.type",
  };
  sections[0] = encoder.encode(JSON.stringify(old_manifest));
  sections[2] = encoder.encode(decoder.decode(sections[2]).replaceAll("pip.core.", "relation.core.")
    .replaceAll("pip.meta.", "relation.meta.").replace("pip-workspace@3", "relation-workspace@3"));
  let cursor = PIP_HEADER_SIZE;
  const offsets = sections.map(section => {
    cursor = align8(cursor);
    const offset = cursor;
    cursor += section.length;
    return offset;
  });
  const result = new Uint8Array(cursor);
  result.set(bytes.subarray(0, PIP_HEADER_SIZE));
  const result_view = new DataView(result.buffer);
  for (const [index, section] of sections.entries()) {
    const entry = 16 + index * PIP_SECTION_ENTRY_SIZE;
    writeU64(result_view, entry, offsets[index]);
    writeU64(result_view, entry + 8, section.length);
    result.set(await sha256(section), entry + 16);
    result.set(section, offsets[index]);
  }
  return { bytes: result, dependency, old_manifest, offsets };
}

test("旧 A5 原始清单与依赖哈希不改写，缺失依赖不自动替换", async () => {
  const { bytes, dependency, old_manifest } = await old_package();
  const before = bytes.slice();
  const decoded = await decodePip(bytes, io_options);
  assert.deepEqual(decoded.manifest, old_manifest);
  const runtime_manifest = migrate_node_map_manifest({
    ...old_manifest, requiredCapabilities: ["relation-node-type/2"],
  });
  assert.deepEqual(runtime_manifest.requiredCapabilities, ["pip-node-type/2"]);
  assert.equal(runtime_manifest.rootNodeId, "pip.core.type");
  assert.deepEqual(runtime_manifest.dependencies, old_manifest.dependencies);
  assert.match(decoded.rootTreeText, /relation-workspace@3/);
  const requests = [];
  await assert.rejects(() => decodeNodeMapPackage(bytes, {
    ...io_options,
    resolvePackage(reference) {
      requests.push(reference);
      return undefined;
    },
  }), /缺少精确 A4 依赖/);
  assert.deepEqual(requests, [dependency]);
  assert.deepEqual(bytes, before);
  await assert.rejects(() => encodePip(decoded, io_options), /must be migrated/);
});

test("旧包先验证原始区段哈希，再解析和迁移文档", async () => {
  const { bytes, offsets } = await old_package();
  bytes[offsets[2]] ^= 1;
  await assert.rejects(() => decodeNodeMapPackage(bytes, io_options), /section 2 hash mismatch/);
});
