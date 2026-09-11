import assert from "node:assert/strict";
import test from "node:test";
import {
  createHostCanvasState,
  HostPresentationStore,
  tabStripHeightAfterWorkspaceDrop,
} from "../pip-editor/pip-host/workspace/host-presentation-store.ts";
import {
  EditorPreferenceStore,
} from "../pip-editor/pip-host-io/preferences/store.ts";

test("host canvas starts empty and workspace windows stay outside business state", () => {
  const published = [];
  const store = new HostPresentationStore((state) => published.push(state));

  assert.deepEqual(store.snapshot(), createHostCanvasState());
  store.presentWorkspace("workspace.one", { x: 700, y: 500 });

  const window = store.snapshot().workspaceWindows["workspace.one"];
  assert.equal(window.workspaceId, "workspace.one");
  assert.equal(store.snapshot().activeWindowId, window.id);
  assert.equal(window.frame.resizeMode, "full");
  assert.deepEqual(
    { x: window.frame.x, y: window.frame.y },
    { x: 140, y: 140 },
  );
  assert.ok(published.length > 0);

  store.restoreWorkspaceTab("workspace.one");
  assert.equal(store.snapshot().workspaceWindows["workspace.one"], undefined);
});

test("host system windows and workspace windows have independent presentations", () => {
  const store = new HostPresentationStore(() => {});
  store.presentWorkspace("workspace.one", { x: 700, y: 500 });
  store.openSystemWindow(
    {
      id: "system.instance.host:host.preferences",
      pluginId: "host.preferences",
      instanceId: "system.instance.host:host.preferences",
    },
    { x: 1200, y: 700 },
    { width: 520, height: 520, resizeMode: "simple" },
  );

  assert.ok(store.snapshot().workspaceWindows["workspace.one"]);
  assert.ok(
    store.snapshot().systemWindows["system.instance.host:host.preferences"],
  );
  store.closeSystemWindow("system.instance.host:host.preferences");
  assert.ok(store.snapshot().workspaceWindows["workspace.one"]);
});

test("a workspace tab dropped on the host uses the pointer as its top-left", () => {
  const store = new HostPresentationStore(() => {});

  store.presentWorkspace(
    "workspace.one",
    { x: 834.5, y: -72 },
    "top-left",
    { width: 1000, height: 700 },
  );

  const frame = store.snapshot().workspaceWindows["workspace.one"].frame;
  assert.deepEqual(
    { x: frame.x, y: frame.y },
    { x: 834.5, y: -72 },
  );
  assert.equal(frame.resizeMode, "full");
  assert.deepEqual(
    { width: frame.width, height: frame.height },
    { width: 872, height: 572 },
  );
});

test("dropping the only tab removes its strip from host coordinates", () => {
  assert.equal(
    tabStripHeightAfterWorkspaceDrop(["workspace.one"], "workspace.one"),
    0,
  );
  assert.equal(
    tabStripHeightAfterWorkspaceDrop(
      ["workspace.one", "workspace.two"],
      "workspace.one",
    ),
    42,
  );
});

test("new workspace windows remain smaller than the zoomed host viewport", () => {
  const store = new HostPresentationStore(() => {});
  store.setCamera({ scale: 2, x: 0, y: 0 });

  store.presentWorkspace(
    "workspace.one",
    { x: 400, y: 300 },
    "center",
    { width: 1600, height: 1200 },
  );

  const frame = store.snapshot().workspaceWindows["workspace.one"].frame;
  assert.deepEqual(
    { width: frame.width, height: frame.height },
    { width: 736, height: 536 },
  );
});

test("catalog-opened workspaces use the latest measured host viewport", () => {
  const store = new HostPresentationStore(() => {});
  store.setViewport({ width: 1000, height: 700 });

  store.presentWorkspace("workspace.imported", { x: 500, y: 350 });

  const frame = store.snapshot().workspaceWindows["workspace.imported"].frame;
  assert.deepEqual(
    { width: frame.width, height: frame.height },
    { width: 872, height: 572 },
  );
});

test("catalog-opened workspaces center in the currently visible host region", () => {
  const store = new HostPresentationStore(() => {});
  store.setCamera({ scale: 1, x: -1400, y: -300 });
  store.setViewport({ width: 1000, height: 700 });

  store.presentWorkspace("workspace.imported");

  const frame = store.snapshot().workspaceWindows["workspace.imported"].frame;
  assert.deepEqual(
    { x: frame.x, y: frame.y },
    { x: 1464, y: 364 },
  );
});

test("editor preferences validate storage and persist the workspace open mode", () => {
  const values = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  try {
    values.set("intent-map.editor-preferences.v1", "{broken");
    const published = [];
    const store = new EditorPreferenceStore((value) => published.push(value));
    assert.equal(store.snapshot().workspaceOpenMode, "tab");

    store.setWorkspaceOpenMode("window");
    assert.equal(store.snapshot().workspaceOpenMode, "window");
    assert.equal(published.at(-1).workspaceOpenMode, "window");

    const restored = new EditorPreferenceStore(() => {});
    assert.equal(restored.snapshot().workspaceOpenMode, "window");
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
