import assert from "node:assert/strict";
import test from "node:test";
import { environmentConfig, requireEnvironment } from "../pip-editor-io/spot-terminal/runtime/environment.js";
import { switchEnvironment } from "../pip-editor-io/spot-terminal/runtime/commands.js";
import { terminalCreator } from "../pip-editor-io/spot-terminal/runtime/creator.js";
import { loginView, terminalView } from "../pip-editor-io/spot-terminal/elements/render.js";

const relation = (id, predicate, value) => ({
  id, predicate: { nodeId: predicate, relationId: "identity" },
  object: { kind: "const", value }, relations: [],
});
const terminal = (id, environment) => ({ id, relations: [
  relation("config", "spot.terminal.predicate.config", { environment }),
  relation("state", "spot.terminal.predicate.state", { authenticated: true, botEnabled: true }),
] });

test("fixed environments resolve canonical HTTP and WebSocket bases", () => {
  assert.equal(environmentConfig({ environment: "local" }).apiBase, "http://127.0.0.1:8080");
  assert.equal(environmentConfig({ environment: "server" }).apiBase, "http://47.129.119.217");
  assert.equal(environmentConfig({ apiBase: "http://47.129.119.217" }).environment, "server");
  assert.equal(environmentConfig({ apiBase: "https://untrusted.invalid" }).environment, "local");
  assert.equal(environmentConfig({ environment: "server" }).apiBase.replace(/^http/, "ws"), "ws://47.129.119.217");
  assert.throws(() => requireEnvironment("custom"), /不支持/);
});

test("environment switch resets only its terminal and persists no credentials", () => {
  const first = terminal("first", "local"), second = terminal("second", "server");
  const patch = switchEnvironment({ terminalId: "first", environment: "server" }, {
    revision: 9, nodes: { first, second },
  });
  const config = patch.operations.find((operation) => operation.op === "put-relation" && operation.nodeId === "first" && operation.relation.id === "config");
  const state = patch.operations.find((operation) => operation.op === "put-relation" && operation.nodeId === "first" && operation.relation.id === "state");
  assert.deepEqual(config.relation.object.value, { environment: "server" });
  assert.equal(state.relation.object.value.authenticated, false);
  assert.equal(state.relation.object.value.botEnabled, false);
  assert.ok(patch.operations.some((operation) => operation.op === "put-node" && operation.node.id.includes(":fact:robot:")));
  assert.doesNotMatch(JSON.stringify(patch), /accessToken|password|apiBase/);
  assert.equal(second.relations[0].object.value.environment, "server");
});

test("creator persists only the environment identifier", () => {
  const created = terminalCreator.create({ graph: { revision: 0, nodes: {} } });
  const text = JSON.stringify(created.patch);
  assert.match(text, /\"environment\":\"local\"/);
  assert.doesNotMatch(text, /apiBase|accessToken|password/);
});

test("A3 shows compact environment controls before and after login", () => {
  const local = loginView({ environment: "local", host: "127.0.0.1" });
  assert.match(local, /data-environment="local"/);
  assert.match(local, /127\.0\.0\.1/);
  assert.doesNotMatch(local, /name="password"/);
  const server = loginView({ environment: "server", host: "47.129.119.217" });
  assert.match(server, /name="password"/);
  const terminalHtml = terminalView({ environment: "server", host: "47.129.119.217", symbols: [], ticker: {} });
  assert.match(terminalHtml, /data-environment="server"/);
  assert.match(terminalHtml, /47\.129\.119\.217/);
});
