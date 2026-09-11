import assert from "node:assert/strict";
import test from "node:test";
import { ElementPluginRegistry } from "../pip-editor/pip-host/activation/element-registry.ts";

const plugin = (id = "official.text", tag = "intent-text-preview") => ({
  manifest: { packageId: id, packageVersion: "1.0.0", entrySha256: "a".repeat(64), sourceSha256: "b".repeat(64), elements: [{ id: "text", tag, purpose: "preview" }] }, entrySource: "register", files: {}, pipBytes: new Uint8Array(), contentSha256: "c".repeat(64),
});

test("runtime installs, resolves and disables an element plugin", async () => {
  const tags = new Map();
  const registry = new ElementPluginRegistry({ registry: { get: (tag) => tags.get(tag) }, load: async () => tags.set("intent-text-preview", class {}) });
  assert.equal(await registry.install(plugin()), "installed");
  assert.equal(await registry.install(plugin()), "already-active");
  assert.equal(registry.resolve("official.text", "text").tag, "intent-text-preview");
  registry.disable("official.text");
  assert.equal(registry.resolve("official.text", "text"), undefined);
  assert.ok(tags.has("intent-text-preview"), "browser tag remains registered after disable");
  assert.equal(await registry.install(plugin()), "reactivated");
  await assert.rejects(() => registry.install({ ...plugin(), manifest: { ...plugin().manifest, packageVersion: "2.0.0" } }), /conflicts with installed immutable package/);
});

test("runtime rejects tag conflicts, missing registration and loader errors", async () => {
  const occupied = new Map([["intent-text-preview", class {}]]);
  await assert.rejects(() => new ElementPluginRegistry({ registry: { get: (tag) => occupied.get(tag) }, load: async () => {} }).install(plugin()), /already registered/);
  await assert.rejects(() => new ElementPluginRegistry({ registry: { get: () => undefined }, load: async () => {} }).install(plugin()), /did not register/);
  await assert.rejects(() => new ElementPluginRegistry({ registry: { get: () => undefined }, load: async () => { throw new Error("boom"); } }).install(plugin()), /boom/);
});

test("concurrent element installs share one module execution", async () => {
  const tags = new Map();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let loads = 0;
  const registry = new ElementPluginRegistry({ registry: { get: (tag) => tags.get(tag) }, load: async () => { loads += 1; await gate; tags.set("intent-text-preview", class {}); } });
  const first = registry.install(plugin());
  const second = registry.install(plugin());
  release();
  assert.deepEqual(await Promise.all([first, second]), ["installed", "already-active"]);
  assert.equal(loads, 1);
});
