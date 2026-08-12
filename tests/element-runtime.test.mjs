import assert from "node:assert/strict";
import test from "node:test";
import { ElementPluginRegistry } from "../app/_editor/plugin-editor/element-runtime.ts";

const plugin = (id = "official.text", tag = "intent-text-preview") => ({
  manifest: { id, version: "1.0.0", elements: [{ id: "text", tag, purpose: "preview" }] }, entrySource: "register", files: {}, archive: new Uint8Array(),
});

test("runtime installs, resolves and disables an element plugin", async () => {
  const tags = new Map();
  const registry = new ElementPluginRegistry({ registry: { get: (tag) => tags.get(tag) }, load: async () => tags.set("intent-text-preview", class {}) });
  await registry.install(plugin());
  assert.equal(registry.resolve("official.text", "text").tag, "intent-text-preview");
  registry.disable("official.text");
  assert.equal(registry.resolve("official.text", "text"), undefined);
  assert.ok(tags.has("intent-text-preview"), "browser tag remains registered after disable");
});

test("runtime rejects tag conflicts, missing registration and loader errors", async () => {
  const occupied = new Map([["intent-text-preview", class {}]]);
  await assert.rejects(() => new ElementPluginRegistry({ registry: { get: (tag) => occupied.get(tag) }, load: async () => {} }).install(plugin()), /already registered/);
  await assert.rejects(() => new ElementPluginRegistry({ registry: { get: () => undefined }, load: async () => {} }).install(plugin()), /did not register/);
  await assert.rejects(() => new ElementPluginRegistry({ registry: { get: () => undefined }, load: async () => { throw new Error("boom"); } }).install(plugin()), /boom/);
});
