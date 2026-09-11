import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

// 执行真实 JSX 回调，模拟父组件状态；无需启动浏览器或加载整个宿主。
async function callback(name, context) {
  const source = await readFile(new URL("../pip-editor/pip-host/pip-host.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile("pip-host.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  const visit = node => {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === name) {
      expression = node.initializer.expression;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(expression, `Missing ${name} callback`);
  return runInNewContext(`(${expression.getText(file)})`, context);
}

test("标签拖入画布清除旧创建器请求，仍呈现并聚焦工作区", async () => {
  let creator_request = 3;
  let active_workspace = "workspace.one";
  let focused_workspace;
  const presentations = [];
  const context = {
    setCreatorRequest(value) { creator_request = typeof value === "function" ? value(creator_request) : value; },
    setActiveWorkspaceId(value) { active_workspace = value; },
    setFocusedWorkspaceId(value) { focused_workspace = value; },
    hostStore: { presentWorkspace(...args) { presentations.push(args); } },
  };
  const drop = await callback("onWorkspaceDrop", context);
  const point = { x: 100, y: 200 };
  const viewport = { width: 1000, height: 700 };
  drop("workspace.one", point, viewport);
  assert.equal(creator_request, 0);
  assert.equal(active_workspace, undefined);
  assert.equal(focused_workspace, "workspace.one");
  assert.deepEqual(presentations, [["workspace.one", point, "top-left", viewport]]);

  // 拖放之后用户再次点击“＋”，仍应产生一次新的打开请求。
  const open = await callback("onOpenCreator", context);
  open();
  assert.equal(creator_request, 1);
});
