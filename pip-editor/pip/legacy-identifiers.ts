/** 旧名称只在兼容边界出现；仅迁移已知的官方语义，不替换任意字符串。 */
const semantic_groups: Record<string, string[]> = {
  core: ["identity", "predicate", "type"],
  meta: ["revision", "root-node-ids", "workspace"],
  "host.type": ["plugin-manager", "preferences"],
  "projection.type": ["instance"],
  "projection.definition": ["properties", "contains", "flow"],
  "projection.predicate": [
    "observes", "uses", "dives-into", "presents", "child-predicate", "frame",
  ],
  "flow.type": ["executable", "composite", "state", "effect"],
  "flow.predicate": [
    "input", "output", "contains", "binding", "value-type", "required",
    "public-entry", "queue-capacity", "delay-boundary",
  ],
  "trigger.type": ["manual", "hook", "schedule", "poll", "custom"],
  "trigger.predicate": [
    "target", "enabled", "input-mapping", "configuration", "change-detector",
    "output-sink", "overlap-policy",
  ],
  "execution.type": ["run"],
  "execution.predicate": ["target", "status", "graph-revision", "outputs", "trace"],
};

const semantic_ids = Object.entries(semantic_groups).flatMap(([group, names]) =>
  names.map(name => `${group}.${name}`),
);
const runtime_ids = [
  "properties", "contains", "flow", "attach-child-projection",
  "detach-child-projection", "move-child-projection", "flow.connect",
  "flow.disconnect", "flow.effect", "flow.effect-runtime",
  "flow.executable-runtime", "flow.state-runtime", "flow.planner",
];

export const legacy_identifiers = new Map(
  [...semantic_ids, ...runtime_ids].map(id => [`relation.${id}`, `pip.${id}`]),
);
legacy_identifiers.set("official.relation-projection-elements", "official.pip-projection-elements");
legacy_identifiers.set("official.relation-projection-types", "official.pip-projection-types");

export function migrate_identifier(id: string): string {
  // 执行实例由宿主生成 UUID；仅识别这个明确的动态身份族。
  if (/^relation\.execution\.run\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return `pip.execution.run.${id.slice("relation.execution.run.".length)}`;
  }
  return legacy_identifiers.get(id) ?? id;
}
