import assert from "node:assert/strict";
import test from "node:test";
import { buildIntentPluginSuite } from "../pip-editor-io/intent/suite.ts";
import { buildScenePluginSuite } from "../pip-editor-io/scene/suite.ts";
import { buildSpotTerminalPluginSuite } from "../pip-editor-io/spot-terminal/suite.ts";
import { buildPipProjectionPlugins } from "../pip-editor-io/pip-projections/suite.ts";
import { importPip } from "../pip-editor/pip-host/packages/import-pip.ts";
import { validateNodeTypeDependencies } from "../pip-editor/pip-host/packages/node-type-package.ts";

// 从空安装状态导入单个 A4，验证真实导入路径会先安装其精确 A3 依赖。
for (const build_suite of [
  buildPipProjectionPlugins, buildIntentPluginSuite,
  buildScenePluginSuite, buildSpotTerminalPluginSuite,
]) {
  test(`${build_suite.name}: A4 自带 A3，无需单独选择元素包`, async () => {
    const suite = await build_suite();
    const installed_elements = [];
    const install_order = [];
    const result = await importPip(suite.nodeTypePip, {
      confirmTrust(_manifest, hashes) {
        assert.ok(hashes.includes(suite.element.contentSha256));
        return true;
      },
      trustHashes() {},
      async installElement(element) {
        assert.deepEqual(element.pipBytes, suite.elementPip);
        installed_elements.push(element);
        install_order.push("a3");
        return "installed";
      },
      async installNodeType(plugin) {
        validateNodeTypeDependencies(plugin, installed_elements);
        assert.equal(plugin.embeddedElements.length, plugin.manifest.dependencies.length);
        install_order.push("a4");
        return "installed";
      },
      openNodeMap() { assert.fail("单个 A4 不应打开 A5"); },
    });
    assert.equal(result.layer, "a4");
    assert.deepEqual(install_order, ["a3", "a4"]);
  });
}
