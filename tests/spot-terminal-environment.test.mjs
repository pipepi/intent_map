import { createGraph, pipStatement } from "../pip-editor/pip/pip-model.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { environmentConfig, requireEnvironment } from "../pip-editor-io/spot-terminal/runtime/environment.js";
import { switchEnvironment } from "../pip-editor-io/spot-terminal/runtime/commands.js";
import { terminalCreator } from "../pip-editor-io/spot-terminal/runtime/creator.js";
import { loginView, terminalView } from "../pip-editor-io/spot-terminal/elements/render.js";

const pip = (id, predicate, value) => ({
  id,
    fork_level: 3,
    predicate_value: { predicate: { node_id: predicate, pip_id: "identity" }, value: { kind: "const", value } },
    pips: []
});
const terminal = (id, environment) => ({ id, fork_level: 2, pips: [
  pip("config", "spot.terminal.predicate.config", { environment }),
  pip("state", "spot.terminal.predicate.state", { authenticated: true, botEnabled: true }),
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
  const patch = switchEnvironment({ terminalId: "first", environment: "server" }, createGraph({ first, second }, 9));
  const config = patch.operations.find((operation) => operation.op === "put" && operation.parent_path[0] === "first" && operation.pip.id === "config");
  const state = patch.operations.find((operation) => operation.op === "put" && operation.parent_path[0] === "first" && operation.pip.id === "state");
  assert.deepEqual(pipStatement(config.pip).value.value, { environment: "server" });
  assert.equal(pipStatement(state.pip).value.value.authenticated, false);
  assert.equal(pipStatement(state.pip).value.value.botEnabled, false);
  assert.ok(patch.operations.some((operation) => operation.op === "put" && operation.parent_path.length === 0 && operation.pip.id.includes(":fact:robot:")));
  assert.doesNotMatch(JSON.stringify(patch), /accessToken|password|apiBase/);
  assert.equal(pipStatement(second.pips[0]).value.value.environment, "server");
});

test("creator persists only the environment identifier", () => {
  const created = terminalCreator.create({ graph: createGraph({}, 0) });
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
