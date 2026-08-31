import assert from "node:assert/strict";
import test from "node:test";
import { SystemPluginRegistry } from "../pip-editor/relation-host-io/system-plugin/registry.ts";
import {
  createSystemPluginTypeNode,
  SystemPluginRuntime,
} from "../pip-editor/relation-host-io/system-plugin/runtime.ts";

const Component = () => null;

const definition = ({
  id,
  scope = "host",
  instancePolicy = "singleton",
  dispose,
}) => ({
  id,
  typeNode: createSystemPluginTypeNode(`relation.host.type.${id}`),
  label: id,
  category: "系统",
  scope,
  instancePolicy,
  defaultWindow: {
    width: 640,
    height: 720,
    resizeMode: "full",
  },
  createState: () => ({ count: 1 }),
  dispose,
  buildModel: (_snapshot, instance) => instance.state,
  Component,
});

test("registry rejects duplicate ids, duplicate type nodes, and invalid windows", () => {
  const first = definition({ id: "first" });
  assert.throws(
    () => new SystemPluginRegistry([first, first]),
    /Duplicate system plugin first/,
  );

  const duplicateType = {
    ...definition({ id: "second" }),
    typeNode: first.typeNode,
  };
  assert.throws(
    () => new SystemPluginRegistry([first, duplicateType]),
    /Duplicate system plugin type/,
  );

  const invalidWindow = {
    ...definition({ id: "small" }),
    defaultWindow: {
      width: 120,
      height: 120,
      resizeMode: "full",
    },
  };
  assert.throws(
    () => new SystemPluginRegistry([invalidWindow]),
    /window is invalid/,
  );

  const nonFiniteWindow = {
    ...definition({ id: "non-finite" }),
    defaultWindow: {
      width: Number.NaN,
      height: 720,
      resizeMode: "full",
    },
  };
  assert.throws(
    () => new SystemPluginRegistry([nonFiniteWindow]),
    /window is invalid/,
  );

  const invalidTypeNode = {
    ...definition({ id: "invalid-type" }),
    typeNode: {
      id: "relation.host.type.invalid-type",
      relations: [],
    },
  };
  assert.throws(
    () => new SystemPluginRegistry([invalidTypeNode]),
    /type node is not canonical/,
  );
});

test("runtime shares host singletons and isolates workspace singletons", () => {
  const host = definition({ id: "host-manager" });
  const workspace = definition({
    id: "workspace-manager",
    scope: "workspace",
  });
  const runtime = new SystemPluginRuntime(
    new SystemPluginRegistry([host, workspace]),
    () => {},
  );

  const hostOne = runtime.ensure(host.id, "workspace.one");
  const hostTwo = runtime.ensure(host.id, "workspace.two");
  assert.equal(hostOne, hostTwo);

  const workspaceOne = runtime.ensure(workspace.id, "workspace.one");
  const workspaceTwo = runtime.ensure(workspace.id, "workspace.two");
  assert.notEqual(workspaceOne.id, workspaceTwo.id);
  assert.equal(workspaceOne.workspaceId, "workspace.one");
  assert.equal(workspaceTwo.workspaceId, "workspace.two");

  runtime.disposeWorkspace("workspace.one");
  assert.equal(runtime.get(workspaceOne.id), undefined);
  assert.equal(runtime.get(hostOne.id), hostOne);
});

test("multiple instances are independent and release their overlay nodes", () => {
  const disposed = [];
  const multiple = definition({
    id: "diagnostic",
    instancePolicy: "multiple",
    dispose: (instance) => disposed.push(instance.id),
  });
  let publishes = 0;
  const runtime = new SystemPluginRuntime(
    new SystemPluginRegistry([multiple]),
    () => {
      publishes += 1;
    },
  );

  const first = runtime.ensure(multiple.id, "workspace.one");
  const second = runtime.ensure(multiple.id, "workspace.one");
  assert.notEqual(first.id, second.id);
  assert.ok(runtime.snapshot().graph.nodes[first.id]);
  assert.ok(runtime.snapshot().graph.nodes[second.id]);

  runtime.setState(first.id, { count: 2 });
  assert.deepEqual(runtime.get(first.id).state, { count: 2 });
  assert.deepEqual(runtime.get(second.id).state, { count: 1 });

  runtime.releasePresentation(first.id);
  assert.equal(runtime.get(first.id), undefined);
  assert.deepEqual(disposed, [first.id]);
  assert.ok(publishes >= 4);
});

test("runtime reports unknown plugins without mutating its overlay", () => {
  const runtime = new SystemPluginRuntime(
    new SystemPluginRegistry([]),
    () => {},
  );
  const before = runtime.snapshot().graph;
  assert.throws(
    () => runtime.ensure("missing", "workspace.one"),
    /Unknown system plugin missing/,
  );
  assert.equal(runtime.snapshot().graph, before);
});

test("runtime releases host singletons and continues after disposal errors", () => {
  const disposed = [];
  const failing = definition({
    id: "failing-host",
    dispose: (instance) => {
      disposed.push(instance.id);
      throw new Error("release failed");
    },
  });
  const healthy = definition({
    id: "healthy-host",
    dispose: (instance) => {
      disposed.push(instance.id);
    },
  });
  const runtime = new SystemPluginRuntime(
    new SystemPluginRegistry([failing, healthy]),
    () => {},
  );
  const failingInstance = runtime.ensure(failing.id, "workspace.one");
  const healthyInstance = runtime.ensure(healthy.id, "workspace.one");

  const errors = runtime.disposeAll();
  assert.equal(errors.length, 1);
  assert.deepEqual(disposed, [failingInstance.id, healthyInstance.id]);
  assert.equal(runtime.get(failingInstance.id), undefined);
  assert.equal(runtime.get(healthyInstance.id), undefined);
  assert.equal(runtime.snapshot().graph.nodes[failingInstance.id], undefined);
  assert.equal(runtime.snapshot().graph.nodes[healthyInstance.id], undefined);
});
